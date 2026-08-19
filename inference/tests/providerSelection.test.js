import { describe, expect, it } from 'vitest';
import { createEmbeddingProvider } from '../src/embeddings/providers/index.js';

describe('embedding provider selection', () => {
  it('selects OpenAI by default', () => {
    expect(createEmbeddingProvider({ OPENAI_API_KEY: 'test' }).getMetadata().provider)
      .toBe('openai');
  });

  it('selects the Qwen provider explicitly', () => {
    expect(createEmbeddingProvider({ EMBEDDING_PROVIDER: 'qwen' }).getMetadata().provider)
      .toBe('qwen3-embedding');
  });

  it('rejects unknown providers', () => {
    expect(() => createEmbeddingProvider({ EMBEDDING_PROVIDER: 'unknown' }))
      .toThrow('EMBEDDING_PROVIDER must be openai or qwen');
  });
});
