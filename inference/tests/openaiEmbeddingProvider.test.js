import { describe, expect, it, vi } from 'vitest';
import { createOpenAIEmbeddingProvider } from '../src/embeddings/providers/openaiEmbeddingProvider.js';

describe('OpenAI embedding provider', () => {
  it('preserves the existing model request and response behavior', async () => {
    const create = vi.fn(async () => ({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }]
    }));
    const createClient = vi.fn(() => ({ embeddings: { create } }));
    const provider = createOpenAIEmbeddingProvider({
      environment: { OPENAI_API_KEY: 'test-key' },
      dependencies: { createClient, logger: { log: vi.fn() } }
    });

    await expect(provider.embed(['one', 'two']))
      .resolves.toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(create).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['one', 'two']
    });
    expect(createClient).toHaveBeenCalledOnce();
    expect(provider.getMetadata()).toEqual({
      provider: 'openai',
      modelId: 'text-embedding-3-small',
      dimensions: 1536
    });
  });

  it('requires an API key only when initialized', async () => {
    const provider = createOpenAIEmbeddingProvider({ environment: {} });

    expect(provider.isLoaded()).toBe(false);
    await expect(provider.initialize()).rejects.toThrow('OPENAI_API_KEY is required');
  });
});
