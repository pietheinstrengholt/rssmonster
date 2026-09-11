import { describe, expect, it, vi } from 'vitest';
import { initializeConfiguredModels } from '../src/configuredModelStartup.js';

const createEmbeddingService = ({ loaded = true } = {}) => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn(() => ({ model: 'qwen/model', loaded }))
});

const createScoringProvider = ({ loaded = true } = {}) => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getMetadata: vi.fn(() => ({ modelId: 'modernbert/model' })),
  isLoaded: vi.fn(() => loaded)
});

const createGenerationProvider = ({ loaded = true } = {}) => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getMetadata: vi.fn(() => ({ modelId: 'qwen/generation-model' })),
  isLoaded: vi.fn(() => loaded)
});

describe('configured model startup', () => {
  it('loads Qwen and ModernBERT before reporting readiness', async () => {
    const embeddingService = createEmbeddingService();
    const articleScoringProvider = createScoringProvider();
    const generationProvider = createGenerationProvider();
    const logger = { log: vi.fn() };

    await expect(initializeConfiguredModels({
      embeddingService,
      articleScoringProvider,
      generationProvider,
      logger,
      environment: {
        OPENAI_API_KEY: 'test-key',
        EMBEDDING_PROVIDER: 'qwen',
        GENERATION_PROVIDER: 'qwen',
        ARTICLE_SCORING_PROVIDER: 'modernbert'
      }
    })).resolves.toEqual([
      { provider: 'qwen', model: 'qwen/model', loaded: true },
      { provider: 'qwen-generation', model: 'qwen/generation-model', loaded: true },
      { provider: 'modernbert', model: 'modernbert/model', loaded: true }
    ]);

    expect(embeddingService.initialize).toHaveBeenCalledOnce();
    expect(articleScoringProvider.initialize).toHaveBeenCalledOnce();
    expect(generationProvider.initialize).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenLastCalledWith(
      '[INFERENCE] All configured on-device models are loaded; crawl can start'
    );
  });

  it('does not initialize on-device models for an all-OpenAI configuration', async () => {
    const embeddingService = createEmbeddingService();
    const articleScoringProvider = createScoringProvider();
    const generationProvider = createGenerationProvider();
    const logger = { log: vi.fn() };

    await expect(initializeConfiguredModels({
      embeddingService,
      articleScoringProvider,
      generationProvider,
      logger,
      environment: {
        OPENAI_API_KEY: 'test-key',
        EMBEDDING_PROVIDER: 'openai',
        GENERATION_PROVIDER: 'openai',
        ARTICLE_SCORING_PROVIDER: 'openai'
      }
    })).resolves.toEqual([]);

    expect(embeddingService.initialize).not.toHaveBeenCalled();
    expect(articleScoringProvider.initialize).not.toHaveBeenCalled();
    expect(generationProvider.initialize).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('Model ready'));
  });

  it('does not report readiness when model initialization fails', async () => {
    const embeddingService = createEmbeddingService();
    embeddingService.initialize.mockRejectedValue(new Error('load failed'));
    const logger = { log: vi.fn() };

    await expect(initializeConfiguredModels({
      embeddingService,
      articleScoringProvider: createScoringProvider(),
      logger,
      environment: {
        OPENAI_API_KEY: 'test-key',
        EMBEDDING_PROVIDER: 'qwen',
        ARTICLE_SCORING_PROVIDER: 'modernbert'
      }
    })).rejects.toThrow('load failed');

    expect(logger.log).not.toHaveBeenCalledWith(
      '[INFERENCE] All configured on-device models are loaded; crawl can start'
    );
  });

  it('rejects startup when an initialized required model does not report loaded', async () => {
    const logger = { log: vi.fn() };

    await expect(initializeConfiguredModels({
      embeddingService: createEmbeddingService({ loaded: false }),
      articleScoringProvider: createScoringProvider(),
      logger,
      environment: {
        OPENAI_API_KEY: 'test-key',
        EMBEDDING_PROVIDER: 'qwen',
        ARTICLE_SCORING_PROVIDER: 'openai'
      }
    })).rejects.toThrow(
      'Configured embedding model did not report loaded after initialization'
    );

    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('Model ready'));
  });

  it('skips every local initializer for independently configured compatible capabilities', async () => {
    const embeddingService = createEmbeddingService();
    const articleScoringProvider = createScoringProvider();
    const generationProvider = createGenerationProvider();
    const environment = Object.fromEntries(
      ['EMBEDDING', 'GENERATION', 'CLASSIFICATION', 'ASSISTANT'].flatMap(capability => [
        [`${capability}_PROVIDER`, 'openai-compatible'],
        [`${capability}_BASE_URL`, `http://${capability.toLowerCase()}.example/v1`],
        [`${capability}_API_KEY`, `${capability}-secret`],
        [`${capability}_MODEL`, `${capability}-model`]
      ])
    );
    const logger = { log: vi.fn(), warn: vi.fn() };
    await expect(initializeConfiguredModels({
      embeddingService, articleScoringProvider, generationProvider, environment, logger
    })).resolves.toEqual([]);
    expect(embeddingService.initialize).not.toHaveBeenCalled();
    expect(articleScoringProvider.initialize).not.toHaveBeenCalled();
    expect(generationProvider.initialize).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('secret');
  });

  it('validates all capabilities before starting any local model load', async () => {
    const embeddingService = createEmbeddingService();
    const generationProvider = createGenerationProvider();
    await expect(initializeConfiguredModels({
      embeddingService, generationProvider,
      environment: {
        EMBEDDING_PROVIDER: 'local', GENERATION_PROVIDER: 'local', CLASSIFICATION_PROVIDER: 'local',
        ASSISTANT_PROVIDER: 'openai-compatible', ASSISTANT_API_KEY: 'secret'
      },
      logger: { log: vi.fn(), warn: vi.fn() }
    })).rejects.toThrow('ASSISTANT_BASE_URL is required');
    expect(embeddingService.initialize).not.toHaveBeenCalled();
    expect(generationProvider.initialize).not.toHaveBeenCalled();
  });

});
