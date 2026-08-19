import { describe, expect, it } from 'vitest';
import {
  getArticleScoringConfig,
  getAssistantConfig,
  getConfig,
  getGenerationConfig,
  getEmbeddingConfig
} from '../src/config/config.js';

describe('inference config', () => {
  it('uses loopback defaults', () => {
    expect(getConfig({})).toEqual({ host: '127.0.0.1', port: 3001 });
  });

  it('reads host and port from the environment', () => {
    expect(getConfig({ INFERENCE_HOST: '0.0.0.0', INFERENCE_PORT: '4001' }))
      .toEqual({ host: '0.0.0.0', port: 4001 });
  });

  it('rejects an invalid port', () => {
    expect(() => getConfig({ INFERENCE_PORT: 'invalid' }))
      .toThrow('INFERENCE_PORT must be an integer between 1 and 65535');
  });
});

describe('generation config', () => {
  it('uses OpenAI for every currently supported classification capability', () => {
    expect(getGenerationConfig({})).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      dtype: undefined,
      articleModel: 'gpt-4o-mini',
      smartFolderModel: 'gpt-4.1-mini',
      feedRediscoveryModel: 'gpt-4.1-mini'
    });
  });

  it('keeps generation selection independent from the embedding provider', () => {
    const environment = {
      EMBEDDING_PROVIDER: 'qwen',
      GENERATION_PROVIDER: 'openai'
    };
    expect(getEmbeddingConfig(environment).provider).toBe('qwen');
    expect(getGenerationConfig(environment).provider).toBe('openai');
  });

  it('reads capability model overrides', () => {
    expect(getGenerationConfig({
      GENERATION_PROVIDER: 'openai',
      OPENAI_MODEL_CRAWL: 'article-model',
      OPENAI_MODEL_SMART_FOLDERS: 'folder-model',
      OPENAI_MODEL_FEED_REDISCOVERY: 'feed-model'
    })).toMatchObject({
      articleModel: 'article-model',
      smartFolderModel: 'folder-model',
      feedRediscoveryModel: 'feed-model'
    });
  });

  it('rejects unsupported generation providers', () => {
    expect(() => getGenerationConfig({ GENERATION_PROVIDER: 'other' }))
      .toThrow('GENERATION_PROVIDER must be openai or qwen');
  });

  it('configures Qwen generation', () => {
    expect(getGenerationConfig({ GENERATION_PROVIDER: 'qwen' })).toMatchObject({
      provider: 'qwen',
      modelId: 'onnx-community/Qwen3.5-0.8B-ONNX',
      dtype: 'q4'
    });
  });
});

describe('assistant config', () => {
  it('keeps the assistant on its independent OpenAI provider', () => {
    expect(getAssistantConfig({})).toEqual({ provider: 'openai', modelId: 'gpt-4o-mini' });
    expect(getAssistantConfig({ ASSISTANT_MODEL: 'assistant-model' }).modelId)
      .toBe('assistant-model');
    expect(() => getAssistantConfig({ ASSISTANT_PROVIDER: 'qwen' }))
      .toThrow('ASSISTANT_PROVIDER must be openai');
  });
});

describe('article scoring config', () => {
  it('uses OpenAI scoring by default', () => {
    expect(getArticleScoringConfig({})).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      dtype: undefined
    });
  });

  it('configures the cached ModernBERT scoring model', () => {
    expect(getArticleScoringConfig({ ARTICLE_SCORING_PROVIDER: 'modernbert' })).toEqual({
      provider: 'modernbert',
      modelId: 'onnx-community/ModernBERT-base-nli-ONNX',
      dtype: 'q8'
    });
  });

  it('reads ModernBERT overrides and rejects unsupported providers', () => {
    expect(getArticleScoringConfig({
      ARTICLE_SCORING_PROVIDER: 'modernbert',
      MODERNBERT_MODEL: 'local/test-model',
      MODERNBERT_DTYPE: 'fp32'
    })).toMatchObject({ modelId: 'local/test-model', dtype: 'fp32' });
    expect(() => getArticleScoringConfig({ ARTICLE_SCORING_PROVIDER: 'other' }))
      .toThrow('ARTICLE_SCORING_PROVIDER must be openai or modernbert');
  });
});

describe('embedding config', () => {
  it('uses the existing OpenAI embedding defaults', () => {
    expect(getEmbeddingConfig({})).toEqual({
      provider: 'openai',
      modelId: 'text-embedding-3-small',
      dimensions: 1536,
      maxBatchSize: 8
    });
  });

  it('uses the Qwen3 embedding defaults', () => {
    expect(getEmbeddingConfig({ EMBEDDING_PROVIDER: 'qwen' })).toEqual({
      provider: 'qwen',
      modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
      maxBatchSize: 8
    });
  });

  it('reads the model from the environment', () => {
    expect(getEmbeddingConfig({ EMBEDDING_PROVIDER: 'qwen', EMBEDDING_MODEL: 'test/model' }))
      .toEqual({ provider: 'qwen', modelId: 'test/model', dimensions: 1024, maxBatchSize: 8 });
  });

  it('rejects dimension reduction', () => {
    expect(() => getEmbeddingConfig({ EMBEDDING_PROVIDER: 'qwen', EMBEDDING_DIMENSIONS: '256' }))
      .toThrow('EMBEDDING_DIMENSIONS must be 1024; dimension reduction is not supported');
  });

  it('validates the maximum batch size', () => {
    expect(() => getEmbeddingConfig({ EMBEDDING_MAX_BATCH_SIZE: '0' }))
      .toThrow('EMBEDDING_MAX_BATCH_SIZE must be a positive integer');
  });
});
