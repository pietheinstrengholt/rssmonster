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
        EMBEDDING_PROVIDER: 'openai',
        GENERATION_PROVIDER: 'openai',
        ARTICLE_SCORING_PROVIDER: 'openai'
      }
    })).resolves.toEqual([]);

    expect(embeddingService.initialize).not.toHaveBeenCalled();
    expect(articleScoringProvider.initialize).not.toHaveBeenCalled();
    expect(generationProvider.initialize).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
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
        EMBEDDING_PROVIDER: 'qwen',
        ARTICLE_SCORING_PROVIDER: 'openai'
      }
    })).rejects.toThrow(
      'Configured embedding model did not report loaded after initialization'
    );

    expect(logger.log).not.toHaveBeenCalled();
  });
});
