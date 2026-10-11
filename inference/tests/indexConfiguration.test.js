import { afterEach, describe, expect, it, vi } from 'vitest';
import dotenv from 'dotenv';
import { validateProviderConfiguration } from '../src/config/config.js';

const environmentKeys = [
  'EMBEDDING_PROVIDER',
  'EMBEDDING_MODEL',
  'EMBEDDING_DIMENSIONS',
  'EMBEDDING_MAX_BATCH_SIZE',
  'EMBEDDING_QUEUE_MAX_PENDING',
  'CLASSIFICATION_PROVIDER',
  'CLASSIFICATION_MODEL',
  'MODERNBERT_MODEL',
  'MODERNBERT_DTYPE',
  'GENERATION_PROVIDER',
  'GENERATION_MODEL',
  'GENERATION_DTYPE',
  'GENERATION_QUEUE_MAX_PENDING',
  'ARTICLE_SCORING_PROVIDER',
  'MODERNBERT_QUEUE_MAX_PENDING'
];
const originalEnvironment = Object.fromEntries(
  environmentKeys.map(key => [key, process.env[key]])
);

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(() => {
      process.env.GENERATION_PROVIDER = 'qwen';
      process.env.GENERATION_MODEL = 'test/dotenv-generation-model';
      process.env.GENERATION_DTYPE = 'q8';
      process.env.GENERATION_QUEUE_MAX_PENDING = '2';
      process.env.ARTICLE_SCORING_PROVIDER = 'modernbert';
      process.env.MODERNBERT_QUEUE_MAX_PENDING = '3';
      return { parsed: {} };
    })
  }
}));

vi.mock('../src/app.js', () => ({
  default: { locals: {} }
}));

afterEach(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnvironment[key];
    }
  }
  vi.resetModules();
  vi.unstubAllEnvs();
  dotenv.config.mockClear();
});

describe('inference startup configuration order', () => {
  it('creates the generation singleton after dotenv configuration', async () => {
    await import('../src/index.js');
    const { default: generationProvider } = await import(
      '../src/generation/providers/qwenGenerationProvider.js'
    );

    expect(generationProvider.getMetadata()).toMatchObject({
      modelId: 'test/dotenv-generation-model',
      dtype: 'q8'
    });
    expect(generationProvider.getQueueSnapshot()).toMatchObject({
      concurrency: 1,
      maximumPending: 2
    });
    const { default: articleScoringProvider } = await import(
      '../src/classifications/providers/modernBertArticleScoringProvider.js'
    );
    expect(articleScoringProvider.getQueueSnapshot()).toMatchObject({
      concurrency: 1,
      maximumPending: 3
    });
  });
});

const mockDotenvResult = result => {
  for (const key of environmentKeys) vi.stubEnv(key, undefined);
  for (const key of ['OPENAI_API_KEY', 'ASSISTANT_API_KEY', 'ASSISTANT_PROVIDER',
    'ASSISTANT_BASE_URL', 'ASSISTANT_MODEL']) vi.stubEnv(key, undefined);
  dotenv.config.mockImplementationOnce(() => result);
};

describe('missing inference .env defaults', () => {
  it('validates all requested local defaults without API keys', async () => {
    mockDotenvResult({ error: { code: 'ENOENT' } });
    await import('../src/index.js');

    const configs = validateProviderConfiguration(process.env, { log: vi.fn(), warn: vi.fn() });
    expect(configs.EMBEDDING).toEqual({
      provider: 'local', modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024, maxBatchSize: 8, queueMaxPending: 4
    });
    expect(configs.GENERATION).toMatchObject({
      provider: 'local', modelId: 'onnx-community/Qwen3.5-0.8B-ONNX',
      dtype: 'q4', queueMaxPending: 4
    });
    expect(configs.CLASSIFICATION).toEqual({
      provider: 'local', modelId: 'onnx-community/ModernBERT-base-nli-ONNX',
      dtype: 'q8', queueMaxPending: 4
    });
    const { default: generationProvider } = await import('../src/generation/providers/qwenGenerationProvider.js');
    expect(generationProvider.getMetadata()).toMatchObject({
      modelId: configs.GENERATION.modelId, dtype: 'q4'
    });
    expect(generationProvider.getQueueSnapshot().maximumPending).toBe(4);
  });

  it('preserves explicit environment providers and local model overrides', async () => {
    mockDotenvResult({ error: { code: 'ENOENT' } });
    vi.stubEnv('EMBEDDING_PROVIDER', 'openai-compatible');
    vi.stubEnv('GENERATION_PROVIDER', 'local');
    vi.stubEnv('GENERATION_MODEL', 'custom/generation');
    vi.stubEnv('GENERATION_DTYPE', 'q8');
    vi.stubEnv('GENERATION_QUEUE_MAX_PENDING', '2');
    vi.stubEnv('CLASSIFICATION_PROVIDER', 'openai');
    vi.stubEnv('ARTICLE_SCORING_PROVIDER', 'modernbert');
    await import('../src/index.js');

    expect(process.env.EMBEDDING_PROVIDER).toBe('openai-compatible');
    expect(process.env.CLASSIFICATION_PROVIDER).toBe('openai');
    const { default: generationProvider } = await import('../src/generation/providers/qwenGenerationProvider.js');
    expect(generationProvider.getMetadata()).toMatchObject({ modelId: 'custom/generation', dtype: 'q8' });
    expect(generationProvider.getQueueSnapshot().maximumPending).toBe(2);
  });

  it('preserves the legacy classification provider from the process environment', async () => {
    mockDotenvResult({ error: { code: 'ENOENT' } });
    vi.stubEnv('ARTICLE_SCORING_PROVIDER', 'openai');
    await import('../src/index.js');
    expect(process.env.CLASSIFICATION_PROVIDER).toBe('openai');
  });

  it.each([{ parsed: {} }, { error: { code: 'EACCES' } }])(
    'does not apply missing-file defaults for dotenv result %j', async result => {
      mockDotenvResult(result);
      await import('../src/index.js');
      expect(process.env.EMBEDDING_PROVIDER).toBeUndefined();
      expect(process.env.GENERATION_PROVIDER).toBeUndefined();
      expect(process.env.CLASSIFICATION_PROVIDER).toBeUndefined();
    }
  );
});
