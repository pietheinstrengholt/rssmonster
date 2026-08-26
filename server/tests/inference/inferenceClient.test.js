import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InferenceServiceUnavailableError,
  InferenceTimeoutError,
  resetInferenceCircuitBreakerForTests,
  requestInferenceJson
} from '../../services/inference/inferenceClient.js';

describe('inference client', () => {
  beforeEach(() => {
    resetInferenceCircuitBreakerForTests();
  });

  afterEach(() => {
    resetInferenceCircuitBreakerForTests();
    vi.unstubAllEnvs();
  });

  it('fails closed without performing a request when inference is disabled', async () => {
    const fetchImplementation = vi.fn();
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');

    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'disabled-request',
      fetchImplementation
    })).rejects.toMatchObject({
      name: 'InferenceDisabledError',
      requestId: 'disabled-request',
      inferencePath: '/api/test',
      durationMs: expect.any(Number)
    });
    expect(fetchImplementation).not.toHaveBeenCalled();

  });

  it('posts JSON to the selected inference capability', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ qualityScore: 80 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    await expect(requestInferenceJson('/api/classifications/article', { text: 'Article' }, {
      baseUrl: 'http://inference.internal/',
      requestId: 'crawl-request-123',
      fetchImplementation
    })).resolves.toEqual({ qualityScore: 80 });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://inference.internal/api/classifications/article',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'crawl-request-123'
        },
        body: JSON.stringify({ text: 'Article' })
      })
    );
  });

  it('generates a distinct request ID for each request when none is supplied', async () => {
    const fetchImplementation = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    await requestInferenceJson('/api/test', {}, { fetchImplementation });
    await requestInferenceJson('/api/test', {}, { fetchImplementation });

    const requestIds = fetchImplementation.mock.calls.map(([, options]) =>
      options.headers['X-Request-ID']);
    expect(requestIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIds[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  it('surfaces unavailable services and non-success status codes', async () => {
    const connectionError = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' }
    });
    const unavailableRequest = requestInferenceJson('/api/test', {}, {
      baseUrl: 'http://private-user:private-password@127.0.0.1:3001/',
      requestId: 'unavailable-request',
      fetchImplementation: vi.fn().mockRejectedValue(connectionError)
    });
    await expect(unavailableRequest).rejects.toMatchObject({
      name: 'InferenceServiceUnavailableError',
      code: 'INFERENCE_UNAVAILABLE',
      requestId: 'unavailable-request',
      inferencePath: '/api/test',
      durationMs: expect.any(Number),
      message: 'Inference service unavailable. ' +
        'Check INFERENCE_URL and ensure the service is running. (ECONNREFUSED)'
    });
    await unavailableRequest.catch(error => {
      expect(error).toBeInstanceOf(InferenceServiceUnavailableError);
      expect(error.cause).toBe(connectionError);
      expect(error.message).not.toContain('private-user');
      expect(error.message).not.toContain('private-password');
    });

    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'http-error-request',
      fetchImplementation: vi.fn().mockResolvedValue(new Response(
        'private article https://user:password@example.com?token=secret',
        { status: 503 }
      ))
    })).rejects.toMatchObject({
      code: 'INFERENCE_UNAVAILABLE',
      message: 'Inference request failed with HTTP 503',
      inferenceErrorCode: null,
      requestId: 'http-error-request',
      inferencePath: '/api/test',
      durationMs: expect.any(Number)
    });
  });

  it('rejects malformed JSON responses', async () => {
    await expect(requestInferenceJson('/api/test', {}, {
      requestId: 'invalid-json-request',
      fetchImplementation: vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))
    })).rejects.toMatchObject({
      message: 'Inference response is not valid JSON',
      requestId: 'invalid-json-request',
      inferencePath: '/api/test',
      durationMs: expect.any(Number)
    });
  });

  it('identifies request timeouts for concise crawl logging', async () => {
    const timeoutCause = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const request = requestInferenceJson('/api/test', {}, {
      timeoutMs: 25,
      requestId: 'timeout-request',
      fetchImplementation: vi.fn().mockRejectedValue(timeoutCause)
    });

    await expect(request).rejects.toMatchObject({
      name: 'InferenceTimeoutError',
      code: 'INFERENCE_TIMEOUT',
      requestId: 'timeout-request',
      inferencePath: '/api/test',
      durationMs: expect.any(Number),
      message: 'Inference request timed out after 25ms'
    });
    await request.catch(error => {
      expect(error).toBeInstanceOf(InferenceTimeoutError);
      expect(error.cause).toBe(timeoutCause);
    });
  });

  it('enforces the configured timeout alongside a live caller signal', async () => {
    const controller = new AbortController();
    const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));

    await expect(requestInferenceJson('/api/test', {}, {
      timeoutMs: 10,
      requestId: 'composed-timeout-request',
      signal: controller.signal,
      fetchImplementation
    })).rejects.toMatchObject({
      name: 'InferenceTimeoutError',
      code: 'INFERENCE_TIMEOUT',
      timeoutMs: 10,
      requestId: 'composed-timeout-request'
    });
    expect(controller.signal.aborted).toBe(false);
    expect(fetchImplementation.mock.calls[0][1].signal).not.toBe(controller.signal);
  });
});
