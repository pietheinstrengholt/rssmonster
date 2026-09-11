import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAI } from '../../services/ai/registry.js';
import {
  resetInferenceCircuitBreakerForTests, getInferenceCircuitSnapshot
} from '../../services/inference/inferenceClient.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const input = { text: 'Article content' };
const analysis = { contentSummaryBullets: [], tags: [], advertisementScore: 70, sentimentScore: 70, qualityScore: 70 };
let ai;
beforeEach(() => {
  vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
  vi.stubEnv('INFERENCE_CIRCUIT_FAILURE_THRESHOLD', '1');
  resetInferenceCircuitBreakerForTests();
  ai = createAI();
});
afterEach(() => vi.unstubAllEnvs());

describe('capability to transport reliability', () => {
  it('retains queue-full metadata and Retry-After without opening the classification circuit', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(json({ error: 'inference_queue_full' }, 503, { 'Retry-After': '5' }));
    await expect(ai.classification.classifyArticle(input, { fetchImplementation, requestId: 'queue-request' }))
      .rejects.toMatchObject({ code: 'INFERENCE_UNAVAILABLE', inferenceErrorCode: 'inference_queue_full', retryAfterMs: 5000, requestId: 'queue-request' });
    expect(getInferenceCircuitSnapshot('classification')).toMatchObject({ state: 'closed' });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });
  it('keeps not-ready failures scoped to their existing circuit and avoids automatic retries', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(json({ error: 'not_ready' }, 503, { 'Retry-After': '5' }));
    await expect(ai.classification.classifyArticle(input, { fetchImplementation })).rejects.toMatchObject({ inferenceErrorCode: 'not_ready' });
    await expect(ai.classification.classifyArticle(input, { fetchImplementation })).rejects.toMatchObject({ code: 'INFERENCE_CIRCUIT_OPEN' });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    await expect(ai.embedding.embed(['text'], { fetchImplementation: vi.fn().mockResolvedValue(json({
      model: 'model', dimensions: 1, count: 1, embeddings: [[1]]
    })) })).resolves.toMatchObject({ count: 1 });
  });
  it('preserves caller abort identity and request ID without counting it as a provider failure', async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const pending = ai.classification.classifyArticle(input, { fetchImplementation, signal: controller.signal, requestId: 'cancel-request' });
    const reason = Object.assign(new Error('deadline'), { code: 'FEED_EXECUTION_TIMEOUT' });
    const rejection = expect(pending).rejects.toBe(reason);
    controller.abort(reason);
    await rejection;
    expect(reason.requestId).toBe('cancel-request');
    expect(getInferenceCircuitSnapshot('classification')).toMatchObject({ state: 'closed', consecutiveFailures: 0 });
  });
  it('preserves configured timeouts alongside caller cancellation', async () => {
    const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    await expect(ai.classification.classifyArticle(input, { fetchImplementation, timeoutMs: 10, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'INFERENCE_TIMEOUT', timeoutMs: 10 });
  });
  it('rejects malformed JSON safely after transport succeeds', async () => {
    await expect(ai.classification.classifyArticle(input, { fetchImplementation: vi.fn().mockResolvedValue(new Response('secret-invalid-json')) }))
      .rejects.toThrow('Inference response is not valid JSON');
  });
  it('keeps readiness 503 bodies visible without poisoning work circuits', async () => {
    const fetchImplementation = vi.fn(url => Promise.resolve(url.endsWith('/ready')
      ? json({ state: 'starting', acceptingWork: false }, 503)
      : json({ status: 'ok' })));
    expect(await ai.getHealth({ fetchImplementation })).toMatchObject({ reachable: true, ready: false, state: 'starting' });
    await expect(ai.classification.classifyArticle(input, { fetchImplementation: vi.fn().mockResolvedValue(json(analysis)) }))
      .resolves.toEqual(analysis);
  });
  it('propagates request IDs and cancels streamed HTTP work when a consumer stops', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"type":"first"}\n')); }, cancel });
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(body));
    for await (const event of ai.assistant.stream({ input: [] }, { fetchImplementation, requestId: 'stream-request' })) {
      expect(event.type).toBe('first');
      break;
    }
    expect(fetchImplementation.mock.calls[0][1].headers['X-Request-ID']).toBe('stream-request');
    expect(fetchImplementation.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('decodes fragmented UTF-8 and a final stream event without a newline', async () => {
    const bytes = new TextEncoder().encode('{"type":"delta","text":"é"}\n{"type":"done"}');
    const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    await expect(Array.fromAsync(ai.assistant.stream({ input: [] }, { fetchImplementation: vi.fn().mockResolvedValue(new Response(body)) })))
      .resolves.toEqual([{ type: 'delta', text: 'é' }, { type: 'done' }]);
  });
  it('distinguishes malformed HTTP status bodies from an unreachable endpoint', async () => {
    const fetchImplementation = vi.fn().mockImplementation(async () => new Response('not-json'));
    expect(await ai.getHealth({ fetchImplementation })).toMatchObject({ reachable: true, ready: false, state: 'unknown' });
  });
  it('preserves queue-full and retry information for streamed requests', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(json({ error: 'inference_queue_full' }, 503, { 'Retry-After': '5' }));
    await expect(Array.fromAsync(ai.assistant.stream({ input: [] }, { fetchImplementation, requestId: 'stream-overload' })))
      .rejects.toMatchObject({ inferenceErrorCode: 'inference_queue_full', retryAfterMs: 5000, requestId: 'stream-overload' });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(getInferenceCircuitSnapshot('assistant')).toBeNull();
  });
  it.each(['abort', 'timeout'])('keeps %s active while consuming a streamed body', async mode => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn(async (_url, { signal }) => new Response(new ReadableStream({
      start(stream) {
        signal.addEventListener('abort', () => stream.error(signal.reason), { once: true });
      }
    })));
    const pending = Array.fromAsync(ai.assistant.stream({ input: [], signal: controller.signal }, {
      fetchImplementation, timeoutMs: mode === 'timeout' ? 10 : 1000, requestId: 'stream-body-request'
    }));
    const rejection = expect(pending).rejects.toMatchObject({
      code: mode === 'timeout' ? 'INFERENCE_TIMEOUT' : 'ABORT_ERR', requestId: 'stream-body-request'
    });
    if (mode === 'abort') {
      await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledOnce());
      controller.abort(new Error('private reason'));
    }
    await rejection;
  });
  it('wraps malformed stream content without exposing it', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response('secret-invalid-stream'));
    await expect(Array.fromAsync(ai.assistant.stream({ input: [] }, { fetchImplementation })))
      .rejects.toMatchObject({ code: 'INFERENCE_STREAM_ERROR', message: 'Assistant inference stream failed' });
  });

});
