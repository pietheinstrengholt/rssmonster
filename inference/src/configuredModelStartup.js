import modernBertArticleScoringProvider from './classifications/providers/modernBertArticleScoringProvider.js';
import { validateProviderConfiguration } from './config/config.js';
import qwenGenerationProvider from './generation/providers/qwenGenerationProvider.js';

const requireLoadedModel = (loaded, capability) => {
  if (!loaded) {
    throw new Error(`Configured ${capability} model did not report loaded after initialization`);
  }
};

export const initializeConfiguredModels = async ({
  embeddingService,
  environment = process.env,
  articleScoringProvider = modernBertArticleScoringProvider,
  generationProvider = qwenGenerationProvider,
  logger = console
}) => {
  const { EMBEDDING: embeddingConfig, CLASSIFICATION: articleScoringConfig, GENERATION: generationConfig } =
    validateProviderConfiguration(environment, logger);
  const loadedModels = [];

  if (embeddingConfig.provider === 'local') {
    await embeddingService.initialize();
    const info = embeddingService.getInfo();
    requireLoadedModel(info.loaded, 'embedding');
    loadedModels.push({ provider: 'qwen', model: info.model, loaded: info.loaded });
    logger.log(
      `[INFERENCE] Model ready capability=embedding provider=local model=${info.model} loaded:${info.loaded}`
    );
  }

  if (generationConfig.provider === 'local') {
    await generationProvider.initialize();
    const metadata = generationProvider.getMetadata();
    const loaded = generationProvider.isLoaded();
    requireLoadedModel(loaded, 'generation');
    loadedModels.push({ provider: 'qwen-generation', model: metadata.modelId, loaded });
    logger.log(
      `[INFERENCE] Model ready capability=generation provider=local model=${metadata.modelId} loaded:${loaded}`
    );
  }

  if (articleScoringConfig.provider === 'local') {
    await articleScoringProvider.initialize();
    const metadata = articleScoringProvider.getMetadata();
    const loaded = articleScoringProvider.isLoaded();
    requireLoadedModel(loaded, 'article scoring');
    loadedModels.push({ provider: 'modernbert', model: metadata.modelId, loaded });
    logger.log(
      `[INFERENCE] Model ready capability=classification provider=local model=${metadata.modelId} loaded:${loaded}`
    );
  }

  if (loadedModels.length > 0) {
    logger.log('[INFERENCE] All configured on-device models are loaded; crawl can start');
  }

  return loadedModels;
};

export default initializeConfiguredModels;
