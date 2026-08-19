// Embedding orchestration will live here when a provider is added.
import { getEmbeddingConfig } from '../config/config.js';
import { createEmbeddingProvider } from './providers/index.js';

export class EmbeddingValidationError extends Error {}

export const createEmbeddingService = ({
  provider,
  environment = process.env,
  logger = console
} = {}) => {
  const { maxBatchSize } = getEmbeddingConfig(environment);
  const selectedProvider = provider || createEmbeddingProvider(environment);
  const debug = String(environment.INFERENCE_DEBUG || '').toLowerCase() === 'true';
  let inferenceQueue = Promise.resolve();

  const validateTexts = texts => {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new EmbeddingValidationError('texts must be a non-empty array');
    }

    if (texts.length > maxBatchSize) {
      throw new EmbeddingValidationError(`texts must contain at most ${maxBatchSize} entries`);
    }

    if (texts.some(text => typeof text !== 'string' || text.trim().length === 0)) {
      throw new EmbeddingValidationError('every text must be a non-empty string');
    }
  };

  const runInference = operation => {
    const result = inferenceQueue.then(operation);
    inferenceQueue = result.catch(() => {});
    return result;
  };

  const embed = async texts => {
    validateTexts(texts);
    const metadata = selectedProvider.getMetadata();
    const startedAt = Date.now();

    if (debug) {
      logger.log(
        `[INFERENCE DEBUG] received embedding batch count=${texts.length} ` +
        `provider=${metadata.provider} model=${metadata.modelId}`
      );
    }

    const embeddings = await runInference(async () => {
      if (debug) {
        logger.log(
          `[INFERENCE DEBUG] calling embedding provider=${metadata.provider} count=${texts.length}`
        );
      }
      return selectedProvider.embed(texts);
    });

    if (debug) {
      logger.log(
        `[INFERENCE DEBUG] completed embedding batch count=${embeddings.length} ` +
        `durationMs=${Date.now() - startedAt}`
      );
    }

    return {
      model: metadata.modelId,
      dimensions: metadata.dimensions,
      count: embeddings.length,
      embeddings
    };
  };

  const getInfo = () => {
    const metadata = selectedProvider.getMetadata();

    return {
      provider: metadata.provider,
      model: metadata.modelId,
      dimensions: metadata.dimensions,
      maxBatchSize,
      loaded: selectedProvider.isLoaded(),
      ...(metadata.task ? { task: metadata.task } : {})
    };
  };

  return Object.freeze({
    embed,
    getInfo,
    initialize: () => selectedProvider.initialize()
  });
};

export default createEmbeddingService();
