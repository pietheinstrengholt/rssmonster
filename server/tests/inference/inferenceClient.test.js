import { describe, expect, it, vi } from 'vitest';
import {
  InferenceServiceUnavailableError,
  InferenceTimeoutError,
  requestInferenceJson
} from '../../services/inference/inferenceClient.js';
import { InferenceDisabledError } from '../../config/intelligentFeatures.js';

describe('inference client', () => {
  it('fails closed without performing a request when inference is disabled', async () => {
    const fetchImplementation = vi.fn();
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');

    await expect(requestInferenceJson('/api/test', {}, { fetchImplementation }))
      .rejects.toBeInstanceOf(InferenceDisabledError);
    expect(fetchImplementation).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('posts JSON to the selected inference capability', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ qualityScore: 80 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    await expect(requestInferenceJson('/api/classifications/article', { text: 'Article' }, {
      baseUrl: 'http://inference.internal/',
      fetchImplementation
    })).resolves.toEqual({ qualityScore: 80 });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://inference.internal/api/classifications/article',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Article' }) })
    );
  });

  it('surfaces unavailable services and non-success status codes', async () => {
    const connectionError = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' }
    });
    const unavailableRequest = requestInferenceJson('/api/test', {}, {
      baseUrl: 'http://127.0.0.1:3001/',
      fetchImplementation: vi.fn().mockRejectedValue(connectionError)
    });
    await expect(unavailableRequest).rejects.toMatchObject({
      name: 'InferenceServiceUnavailableError',
      code: 'INFERENCE_UNAVAILABLE',
      message: 'Inference service unavailable at http://127.0.0.1:3001. ' +
        'Check INFERENCE_URL and ensure the inference service is running. (ECONNREFUSED)'
    });
    await unavailableRequest.catch(error => {
      expect(error).toBeInstanceOf(InferenceServiceUnavailableError);
      expect(error.cause).toBe(connectionError);
    });

    await expect(requestInferenceJson('/api/test', {}, {
      fetchImplementation: vi.fn().mockResolvedValue(new Response('failed', { status: 503 }))
    })).rejects.toThrow('Inference request failed with HTTP 503');
  });

  it('rejects malformed JSON responses', async () => {
    await expect(requestInferenceJson('/api/test', {}, {
      fetchImplementation: vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))
    })).rejects.toThrow('Inference response is not valid JSON');
  });

  it('identifies request timeouts for concise crawl logging', async () => {
    const timeoutCause = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const request = requestInferenceJson('/api/test', {}, {
      timeoutMs: 25,
      fetchImplementation: vi.fn().mockRejectedValue(timeoutCause)
    });

    await expect(request).rejects.toMatchObject({
      name: 'InferenceTimeoutError',
      code: 'INFERENCE_TIMEOUT',
      message: 'Inference request timed out after 25ms'
    });
    await request.catch(error => {
      expect(error).toBeInstanceOf(InferenceTimeoutError);
      expect(error.cause).toBe(timeoutCause);
    });
  });
});
