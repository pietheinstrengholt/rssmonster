import { afterEach, describe, expect, it, vi } from 'vitest';

const environmentKeys = [
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
