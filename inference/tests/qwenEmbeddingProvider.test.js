import { describe, expect, it, vi } from 'vitest';
import { createQwenEmbeddingProvider } from '../src/embeddings/providers/qwenEmbeddingProvider.js';

const { pipelineMock } = vi.hoisted(() => ({ pipelineMock: vi.fn() }));

vi.mock('@huggingface/transformers', () => ({ env: {}, pipeline: pipelineMock }));

const createDependencies = () => {
  const extractor = vi.fn(async () => ({
    tolist: () => [
      new Float32Array([0.1, 0.2]),
      new Float32Array([0.3, 0.4])
    ]
  }));

  return {
    extractor,
    dependencies: {
      configureCache: vi.fn(async () => '/tmp/models'),
      loadExtractor: vi.fn(async () => extractor),
      logger: { log: vi.fn() }
    }
  };
};

describe('Qwen3 embedding provider', () => {
  it('exposes metadata without initializing', () => {
    const { dependencies } = createDependencies();
    const provider = createQwenEmbeddingProvider({ dependencies });

    expect(provider.getMetadata()).toEqual({
      provider: 'qwen3-embedding',
      modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
      dtype: 'fp32',
      device: 'cpu',
      maxInputTokens: 32768,
      task: 'feature-extraction'
    });
    expect(provider.isLoaded()).toBe(false);
    expect(dependencies.loadExtractor).not.toHaveBeenCalled();
  });

  it('shares one lazy initialization across parallel callers', async () => {
    const { dependencies } = createDependencies();
    const provider = createQwenEmbeddingProvider({ dependencies });

    await Promise.all([provider.initialize(), provider.initialize(), provider.initialize()]);

    expect(dependencies.configureCache).toHaveBeenCalledTimes(1);
    expect(dependencies.loadExtractor).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.log).toHaveBeenCalledTimes(2);
    expect(provider.isLoaded()).toBe(true);
    await provider.initialize();
    expect(dependencies.loadExtractor).toHaveBeenCalledTimes(1);
  });

  it('uses documented pooling and normalization and returns plain arrays', async () => {
    const { dependencies, extractor } = createDependencies();
    const provider = createQwenEmbeddingProvider({ dependencies });

    const result = await provider.embed(['one', 'two']);

    expect(extractor).toHaveBeenCalledWith(['one', 'two'], {
      pooling: 'last_token',
      normalize: true
    });
    expect(result).toEqual([
      [expect.closeTo(0.1), expect.closeTo(0.2)],
      [expect.closeTo(0.3), expect.closeTo(0.4)]
    ]);
    expect(Array.isArray(result[0])).toBe(true);
  });

  it('loads the default feature-extraction pipeline', async () => {
    const extractor = vi.fn().mockResolvedValue({ tolist: () => [] });
    pipelineMock.mockResolvedValue(extractor);
    const provider = createQwenEmbeddingProvider({ environment: {} });

    await provider.initialize();

    expect(pipelineMock).toHaveBeenCalledWith(
      'feature-extraction',
      'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      { dtype: 'fp32', device: 'cpu' }
    );
  });
});
