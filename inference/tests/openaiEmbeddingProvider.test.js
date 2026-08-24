import { describe, expect, it, vi } from 'vitest';
import { createOpenAIEmbeddingProvider } from '../src/embeddings/providers/openaiEmbeddingProvider.js';

const { OpenAIMock, defaultCreate } = vi.hoisted(() => ({
  OpenAIMock: vi.fn(),
  defaultCreate: vi.fn().mockResolvedValue({ data: [{ embedding: [1] }] })
}));

vi.mock('openai', () => ({
  default: OpenAIMock.mockImplementation(function OpenAI() {
    this.embeddings = { create: defaultCreate };
  })
}));

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
    await provider.initialize();
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

  it('creates the default OpenAI client', async () => {
    const provider = createOpenAIEmbeddingProvider({
      environment: { OPENAI_API_KEY: 'default-key' }
    });

    await expect(provider.embed(['text'])).resolves.toEqual([[1]]);
    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: 'default-key' });
  });
});
