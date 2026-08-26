import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  embedTexts,
  getEmbeddingInfo
} from '../../services/embeddings/embeddingService.js';
import { InferenceDisabledError } from '../../config/intelligentFeatures.js';
import {
  getInferenceCircuitSnapshot,
  InferenceCircuitOpenError,
  requestInferenceJson,
  resetInferenceCircuitBreakerForTests
} from '../../services/inference/inferenceClient.js';

const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  headers: new Headers(),
  json: vi.fn(async () => payload),
  text: vi.fn(async () => JSON.stringify(payload))
});

describe('inference embedding client', () => {
  beforeEach(() => resetInferenceCircuitBreakerForTests());
  afterEach(() => {
    vi.unstubAllEnvs();
    resetInferenceCircuitBreakerForTests();
  });

  it('fails closed without performing requests when inference is disabled', async () => {
    const fetchImplementation = vi.fn();
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');

    await expect(getEmbeddingInfo({ fetchImplementation }))
      .rejects.toBeInstanceOf(InferenceDisabledError);
    await expect(embedTexts(['one'], { fetchImplementation }))
      .rejects.toBeInstanceOf(InferenceDisabledError);
    expect(fetchImplementation).not.toHaveBeenCalled();

  });

  it('loads the active provider metadata without embedding', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      provider: 'qwen3-embedding',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
      maxBatchSize: 8,
      loaded: false
    }));

    await expect(getEmbeddingInfo({
      fetchImplementation,
      requestId: 'embedding-info-123'
    })).resolves.toMatchObject({
      provider: 'qwen3-embedding',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/embeddings/info',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Request-ID': 'embedding-info-123' }
      })
    );
    expect(fetchImplementation.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('maps batch requests and responses', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      model: 'text-embedding-3-small',
      dimensions: 2,
      count: 2,
      embeddings: [[0.1, 0.2], [0.3, 0.4]]
    }));

    const controller = new AbortController();
    await expect(embedTexts(['one', 'two'], {
      baseUrl: 'http://inference:3001/',
      fetchImplementation,
      requestId: 'embedding-batch-123',
      signal: controller.signal
    })).resolves.toMatchObject({ count: 2, model: 'text-embedding-3-small' });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://inference:3001/api/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ texts: ['one', 'two'] }),
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'embedding-batch-123'
        },
        signal: expect.any(AbortSignal)
      })
    );
    expect(fetchImplementation.mock.calls[0][1].signal).not.toBe(controller.signal);
  });

  it('opens only the embeddings circuit after a qualifying embedding failure', async () => {
    vi.stubEnv('INFERENCE_CIRCUIT_FAILURE_THRESHOLD', '1');
    const embeddingFetch = vi.fn(async () => {
      throw Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' });
    });

    await expect(embedTexts(['one'], {
      fetchImplementation: embeddingFetch,
      requestId: 'embedding-failure-123'
    })).rejects.toMatchObject({
      code: 'INFERENCE_UNAVAILABLE',
      requestId: 'embedding-failure-123',
      inferencePath: '/api/embeddings'
    });

    const classificationFetch = vi.fn(async () => jsonResponse({ qualityScore: 80 }));
    await expect(requestInferenceJson('/api/classifications/article', {}, {
      circuitKey: 'classification',
      fetchImplementation: classificationFetch,
      requestId: 'classification-after-embedding-failure'
    })).resolves.toEqual({ qualityScore: 80 });
    expect(classificationFetch).toHaveBeenCalledOnce();

    await expect(embedTexts(['two'], {
      fetchImplementation: vi.fn(),
      requestId: 'embedding-after-embedding-failure'
    })).rejects.toBeInstanceOf(InferenceCircuitOpenError);
  });

  it('preserves caller cancellation without opening the circuit', async () => {
    const controller = new AbortController();
    const feedTimeoutError = Object.assign(new Error('feed deadline reached'), {
      name: 'TimeoutError',
      code: 'FEED_EXECUTION_TIMEOUT'
    });
    const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const request = embedTexts(['one'], {
      fetchImplementation,
      requestId: 'embedding-abort-123',
      signal: controller.signal
    });
    const rejection = expect(request).rejects.toBe(feedTimeoutError);
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledOnce());

    controller.abort(feedTimeoutError);
    await rejection;

    expect(feedTimeoutError).toMatchObject({
      requestId: 'embedding-abort-123',
      inferencePath: '/api/embeddings'
    });
    expect(getInferenceCircuitSnapshot('embeddings')).toMatchObject({
      state: 'closed',
      consecutiveFailures: 0
    });
  });

  it('reports an unavailable inference service', async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error('connect refused');
    });

    await expect(embedTexts(['one'], { fetchImplementation }))
      .rejects.toThrow('Inference embeddings service unavailable');
  });

  it('reports request timeouts', async () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';

    await expect(embedTexts(['one'], {
      timeoutMs: 25,
      fetchImplementation: vi.fn(async () => { throw error; })
    })).rejects.toThrow('Inference embeddings request timed out after 25ms');
  });

  it('reports non-success HTTP status', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse(
      { error: 'provider failed' },
      { ok: false, status: 500 }
    ));

    await expect(embedTexts(['one'], { fetchImplementation }))
      .rejects.toThrow('Inference embeddings request failed with HTTP 500');
  });

  it('rejects malformed responses', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({ embeddings: [] }));

    await expect(embedTexts(['one'], { fetchImplementation }))
      .rejects.toThrow('Inference embeddings response is malformed');
  });

  it('rejects mismatched vector counts', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      model: 'test-model',
      dimensions: 2,
      count: 1,
      embeddings: [[0.1, 0.2]]
    }));

    await expect(embedTexts(['one', 'two'], { fetchImplementation }))
      .rejects.toThrow('Inference embeddings count mismatch');
  });
});
