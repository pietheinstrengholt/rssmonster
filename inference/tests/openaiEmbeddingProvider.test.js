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
  it('preserves float arrays returned by compatible backends through the real SDK', async () => {
    const { default: OpenAI } = await vi.importActual('openai');
    const vector = Array.from({ length: 768 }, (_, index) => (index + 1) / 768);
    const requests = [];
    const client = new OpenAI({
      apiKey: 'unused',
      baseURL: 'http://lm-studio.test/v1',
      fetch: async (_url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        // LM Studio can return float arrays even when the SDK requests base64.
        return new Response(JSON.stringify({
          data: body.input.map((_, index) => ({ index, embedding: vector }))
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    });
    const provider = createOpenAIEmbeddingProvider({
      environment: {
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_API_KEY: 'unused',
        EMBEDDING_BASE_URL: 'http://lm-studio.test/v1',
        EMBEDDING_MODEL: 'text-embedding-nomic-embed-text-v1.5',
        EMBEDDING_DIMENSIONS: '768'
      },
      dependencies: { createClient: () => client, logger: { log: vi.fn() } }
    });

    await expect(provider.embed(['one'])).resolves.toEqual([vector]);
    await expect(Promise.all([
      provider.embed(['two', 'three']),
      provider.embed(['four'])
    ])).resolves.toEqual([[vector, vector], [vector]]);
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request).toMatchObject({
        model: 'text-embedding-nomic-embed-text-v1.5',
        encoding_format: 'float'
      });
    }
  });

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
      input: ['one', 'two'],
      encoding_format: 'float'
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
    await expect(provider.initialize()).rejects.toThrow('EMBEDDING_API_KEY is required');
  });

  it('creates the default OpenAI client', async () => {
    const provider = createOpenAIEmbeddingProvider({
      environment: { OPENAI_API_KEY: 'default-key' }
    });

    await expect(provider.embed(['text'])).resolves.toEqual([[1]]);
    expect(OpenAIMock).toHaveBeenCalledWith({ apiKey: 'default-key' });
  });

  it('passes the configured base URL to the OpenAI client', async () => {
    const provider = createOpenAIEmbeddingProvider({
      environment: {
        OPENAI_API_KEY: 'default-key',
        OPENAI_BASE_URL: 'https://litellm.example/v1'
      }
    });

    await expect(provider.embed(['text'])).resolves.toEqual([[1]]);
    expect(OpenAIMock).toHaveBeenCalledWith({
      apiKey: 'default-key',
      baseURL: 'https://litellm.example/v1'
    });
  });
});
