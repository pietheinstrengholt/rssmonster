import { describe, expect, it, vi } from 'vitest';
import { createInferenceModelProvider } from '../../services/agent/inferenceModelProvider.js';
import { InferenceDisabledError } from '../../config/intelligentFeatures.js';

describe('inference agent model provider', () => {
  it('fails closed before starting a streamed request when inference is disabled', async () => {
    const fetchImplementation = vi.fn();
    const model = createInferenceModelProvider({ fetchImplementation }).getModel();
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');

    await expect(Array.fromAsync(model.getStreamedResponse({ input: 'Hello' })))
      .rejects.toBeInstanceOf(InferenceDisabledError);
    expect(fetchImplementation).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('maps non-streaming model requests to inference without serializing AbortSignal', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [],
      responseId: 'response-1'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const model = createInferenceModelProvider({ fetchImplementation }).getModel();
    const signal = AbortSignal.timeout(1000);

    await expect(model.getResponse({ input: 'Hello', signal })).resolves.toMatchObject({
      responseId: 'response-1'
    });
    const body = JSON.parse(fetchImplementation.mock.calls[0][1].body);
    expect(body.request).toEqual({ input: 'Hello' });
  });

  it('decodes streamed NDJSON model events', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"started"}\n{"type":"done"}\n'));
        controller.close();
      }
    });
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const model = createInferenceModelProvider({ fetchImplementation }).getModel();

    await expect(Array.fromAsync(model.getStreamedResponse({ input: 'Hello' })))
      .resolves.toEqual([{ type: 'started' }, { type: 'done' }]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/assistant/model/stream',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': expect.stringMatching(/^[0-9a-f-]{36}$/)
        }
      })
    );
  });

  it('wraps credential-bearing stream transport failures with safe correlated metadata', async () => {
    const canaries = [
      'Bearer test-secret-token',
      'apiKey=test-secret-key',
      'https://example.com/private?token=test-query-secret'
    ];
    const cause = new Error(canaries.join(' '));
    const model = createInferenceModelProvider({
      baseUrl: 'http://review-user:review-password@127.0.0.1:3001',
      fetchImplementation: vi.fn().mockRejectedValue(cause)
    }).getModel();

    const request = Array.fromAsync(model.getStreamedResponse({ input: 'Hello' }));

    await expect(request).rejects.toMatchObject({
      name: 'InferenceServiceUnavailableError',
      code: 'INFERENCE_UNAVAILABLE',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      inferencePath: '/api/assistant/model/stream',
      durationMs: expect.any(Number)
    });
    await request.catch(error => {
      expect(error.message).not.toContain('review-password');
      for (const canary of canaries) expect(error.message).not.toContain(canary);
    });
  });

  it('enforces the stream timeout alongside a live caller signal', async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const model = createInferenceModelProvider({
      fetchImplementation,
      timeoutMs: 10
    }).getModel();

    await expect(Array.fromAsync(model.getStreamedResponse({
      input: 'Hello',
      signal: controller.signal
    }))).rejects.toMatchObject({
      name: 'InferenceTimeoutError',
      code: 'INFERENCE_TIMEOUT',
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      inferencePath: '/api/assistant/model/stream'
    });
    expect(controller.signal.aborted).toBe(false);
    expect(fetchImplementation.mock.calls[0][1].signal).not.toBe(controller.signal);
  });
});
