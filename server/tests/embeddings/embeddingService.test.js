import { describe, expect, it, vi } from 'vitest';
import {
  embedTexts,
  getEmbeddingInfo
} from '../../services/embeddings/embeddingService.js';
import { InferenceDisabledError } from '../../config/intelligentFeatures.js';

const jsonResponse = (payload, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: vi.fn(async () => payload),
  text: vi.fn(async () => JSON.stringify(payload))
});

describe('inference embedding client', () => {
  it('fails closed without performing requests when inference is disabled', async () => {
    const fetchImplementation = vi.fn();
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');

    await expect(getEmbeddingInfo({ fetchImplementation }))
      .rejects.toBeInstanceOf(InferenceDisabledError);
    await expect(embedTexts(['one'], { fetchImplementation }))
      .rejects.toBeInstanceOf(InferenceDisabledError);
    expect(fetchImplementation).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('loads the active provider metadata without embedding', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      provider: 'qwen3-embedding',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
      maxBatchSize: 8,
      loaded: false
    }));

    await expect(getEmbeddingInfo({ fetchImplementation })).resolves.toMatchObject({
      provider: 'qwen3-embedding',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024
    });
  });

  it('maps batch requests and responses', async () => {
    const fetchImplementation = vi.fn(async () => jsonResponse({
      model: 'text-embedding-3-small',
      dimensions: 2,
      count: 2,
      embeddings: [[0.1, 0.2], [0.3, 0.4]]
    }));

    await expect(embedTexts(['one', 'two'], {
      baseUrl: 'http://inference:3001/',
      fetchImplementation
    })).resolves.toMatchObject({ count: 2, model: 'text-embedding-3-small' });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://inference:3001/api/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ texts: ['one', 'two'] })
      })
    );
  });

  it('reports an unavailable inference service', async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error('connect refused');
    });

    await expect(embedTexts(['one'], { fetchImplementation }))
      .rejects.toThrow('Inference embeddings service is unavailable: connect refused');
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
