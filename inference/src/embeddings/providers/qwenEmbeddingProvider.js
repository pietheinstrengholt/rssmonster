import { pipeline } from '@huggingface/transformers';
import { getEmbeddingConfig } from '../../config/config.js';
import { configureModelCache } from '../modelCache.js';

const MODEL_DTYPE = 'fp32';
const MODEL_DEVICE = 'cpu';
const MAX_INPUT_TOKENS = 32_768;

const defaultDependencies = {
  configureCache: configureModelCache,
  loadExtractor: modelId => pipeline('feature-extraction', modelId, {
    dtype: MODEL_DTYPE,
    device: MODEL_DEVICE
  }),
  logger: console
};

export const createQwenEmbeddingProvider = ({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) => {
  const config = getEmbeddingConfig({ ...environment, EMBEDDING_PROVIDER: 'qwen' });
  const metadata = Object.freeze({
    provider: 'qwen3-embedding',
    modelId: config.modelId,
    dimensions: config.dimensions,
    dtype: MODEL_DTYPE,
    device: MODEL_DEVICE,
    maxInputTokens: MAX_INPUT_TOKENS,
    task: 'feature-extraction'
  });

  let extractor;
  let initializationPromise;

  const initialize = async () => {
    if (extractor) return;

    if (!initializationPromise) {
      initializationPromise = (async () => {
        dependencies.logger.log(`[INFERENCE] Loading embedding model ${config.modelId}`);
        await dependencies.configureCache(environment);
        extractor = await dependencies.loadExtractor(config.modelId);
        dependencies.logger.log(`[INFERENCE] Loaded embedding model ${config.modelId}`);
      })();
    }

    await initializationPromise;
  };

  const embed = async texts => {
    await initialize();
    const output = await extractor(texts, {
      pooling: 'last_token',
      normalize: true
    });
    return output.tolist().map(vector => Array.from(vector));
  };

  return Object.freeze({
    initialize,
    embed,
    getMetadata: () => metadata,
    isLoaded: () => Boolean(extractor)
  });
};

export default createQwenEmbeddingProvider();
