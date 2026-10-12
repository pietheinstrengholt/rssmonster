import { describe, expect, it } from 'vitest';
import { createEmbeddingProvider } from '../src/embeddings/providers/index.js';

describe('embedding provider selection', () => {
  it('selects OpenAI by default', () => {
    expect(createEmbeddingProvider({ EMBEDDING_API_KEY: 'test', EMBEDDING_BASE_URL: 'https://api.openai.com/v1', GENERATION_API_KEY: 'test', GENERATION_BASE_URL: 'https://api.openai.com/v1', CLASSIFICATION_API_KEY: 'test', CLASSIFICATION_BASE_URL: 'https://api.openai.com/v1', ASSISTANT_API_KEY: 'test', ASSISTANT_BASE_URL: 'https://api.openai.com/v1' }).getMetadata().provider)
      .toBe('openai');
  });

  it('selects the Qwen provider explicitly', () => {
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'local' }).getMetadata().provider)
      .toBe('qwen3-embedding');
  });

  it('rejects unknown providers', () => {
    expect(() => createEmbeddingProvider({ EMBEDDING_PROVIDER: 'unknown' }))
      .toThrow('EMBEDDING_PROVIDER must be local or openai-compatible');
  });
});
