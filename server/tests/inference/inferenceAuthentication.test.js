import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInferenceRequestConfig, requestInferenceJson, requestInferenceStream,
  getSafeInferenceErrorDetails, getInferenceCircuitSnapshot, resetInferenceCircuitBreakerForTests } from '../../services/inference/inferenceClient.js';

const secret = 'test-only opaque:key +/= internal  spaces';
beforeEach(() => {
  vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
  vi.stubEnv('INFERENCE_API_KEY', '');
  vi.stubEnv('INFERENCE_CIRCUIT_FAILURE_THRESHOLD', '1');
  resetInferenceCircuitBreakerForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe('inference transport authentication', () => {
  it('prefers the canonical URL while preserving the legacy fallback and local default', () => {
    vi.stubEnv('INFERENCE_BASE_URL', '');
    vi.stubEnv('INFERENCE_URL', '');
    expect(getInferenceRequestConfig().baseUrl).toBe('http://127.0.0.1:3001');
    vi.stubEnv('INFERENCE_URL', 'http://legacy');
    expect(getInferenceRequestConfig().baseUrl).toBe('http://legacy');
    vi.stubEnv('INFERENCE_BASE_URL', 'http://canonical');
    expect(getInferenceRequestConfig().baseUrl).toBe('http://canonical');
    expect(getInferenceRequestConfig({ baseUrl: 'http://injected' }).baseUrl).toBe('http://injected');
  });
  it.each(['', secret])('attaches only configured credentials to GET, JSON and streaming (%#)', async key => {
    vi.stubEnv('INFERENCE_API_KEY', key);
    const fetchImplementation = vi.fn(async () => new Response('{"ok":true}'));
    const options = { fetchImplementation, requestId: 'authentication-request' };
    await requestInferenceJson('/ready', undefined, { ...options, method: 'GET' });
    await requestInferenceJson('/api/test', {}, options);
    fetchImplementation.mockImplementation(async () => new Response('{"type":"done"}\n'));
    await Array.fromAsync(requestInferenceStream('/api/assistant/model/stream', {}, options));
    for (const [index, [, init]] of fetchImplementation.mock.calls.entries()) {
      expect(init.headers['X-Request-ID']).toBe('authentication-request');
      expect(init.headers['Content-Type']).toBe(index === 0 ? undefined : 'application/json');
      if (key) expect(init.headers['X-Inference-API-Key']).toBe(key);
      else expect(init.headers).not.toHaveProperty('X-Inference-API-Key');
      expect(init.headers).not.toHaveProperty('Authorization');
      expect(init.redirect).toBe(key ? 'error' : undefined);
    }
  });
  it('rejects an unsendable header without exposing its value or counting an outage', async () => {
    vi.stubEnv('INFERENCE_API_KEY', secret + '\ninvalid');
    const fetchImplementation = vi.fn();
    for (const pending of [
      requestInferenceJson('/api/test', {}, { fetchImplementation, circuitKey: 'invalid-key' }),
      Array.fromAsync(requestInferenceStream('/api/test', {}, { fetchImplementation }))
    ]) {
      await expect(pending).rejects.toMatchObject({ code: 'INFERENCE_INVALID_API_KEY' });
      await pending.catch(error => expect(JSON.stringify([error, error.cause, getSafeInferenceErrorDetails(error)])).not.toContain(secret));
    }
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(getInferenceCircuitSnapshot('invalid-key')).toMatchObject({ state: 'closed', consecutiveFailures: 0 });
  });
  it.each([false, true, 'stream'])('classifies 401 without reading unsafe bodies or tripping circuits (%s)', async mode => {
    vi.stubEnv('INFERENCE_API_KEY', secret);
    const logger = { warn: vi.fn() };
    const cancel = vi.fn();
    const fetchImplementation = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 401 }));
    const options = { fetchImplementation, logger, requestId: 'unauthorized-request', circuitKey: 'auth', timeoutMs: 100 };
    for (let i = 0; i < 3; i++) {
      const pending = mode === 'stream' ? Array.fromAsync(requestInferenceStream('/api/test', {}, options)) :
        requestInferenceJson('/ready', undefined, { ...options, method: 'GET', includeHttpStatus: mode });
      await expect(pending).rejects.toMatchObject({ code: 'INFERENCE_UNAUTHORIZED', message: 'Inference authentication failed', status: 401, requestId: 'unauthorized-request' });
      await pending.catch(error => {
        expect(getSafeInferenceErrorDetails(error)).toMatchObject({ code: 'INFERENCE_UNAUTHORIZED', message: 'Inference authentication failed' });
        expect(JSON.stringify([error, getSafeInferenceErrorDetails(error), logger.warn.mock.calls])).not.toContain(secret);
      });
    }
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(cancel).toHaveBeenCalledTimes(3);
    if (mode !== 'stream') expect(getInferenceCircuitSnapshot('auth')).toMatchObject({ state: 'closed', consecutiveFailures: 0 });
  });
});
