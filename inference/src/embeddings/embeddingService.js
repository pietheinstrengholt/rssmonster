// Embedding orchestration will live here when a provider is added.
import { getEmbeddingConfig } from '../config/config.js';
import { createEmbeddingProvider } from './providers/index.js';
import { logInferenceDebug } from '../debug.js';
import { createInferenceWorkQueue } from '../queue/inferenceWorkQueue.js';
import {
  LOCAL_INFERENCE_PRIORITIES,
  runLocalInference
} from '../queue/localInferencePriorityGate.js';

const QUEUE_EVENT_STAGES = Object.freeze({
  queued: 'queued',
  started: 'inference_started',
  completed: 'inference_completed',
  failed: 'inference_failed',
  aborted_pending: 'client_aborted_pending',
  aborted_running: 'client_aborted_running',
  rejected_full: 'overload_rejected'
});

export class EmbeddingValidationError extends Error {}

export const createEmbeddingService = ({
  provider,
  environment = process.env,
  logger = console
} = {}) => {
  const config = getEmbeddingConfig(environment);
  const { maxBatchSize } = config;
  const selectedProvider = provider || createEmbeddingProvider(environment);
  const debug = String(environment.INFERENCE_DEBUG || '').toLowerCase() === 'true';
  let inferenceQueue = Promise.resolve();
  const localWorkQueue = config.provider === 'qwen'
    ? createInferenceWorkQueue({
        concurrency: 1,
        maximumPending: config.queueMaxPending,
        onEvent: event => {
          const message = [
            `embedding-queue stage=${QUEUE_EVENT_STAGES[event.type] || event.type}`,
            `requestId=${JSON.stringify(event.requestId || 'unavailable')}`,
            `operation=${JSON.stringify(event.operation || 'embeddings')}`,
            `running=${event.running}`,
            `pending=${event.pending}`,
            ...(event.queueWaitMs === undefined ? [] : [`queueWaitMs=${event.queueWaitMs}`]),
            ...(event.executionMs === undefined ? [] : [`executionMs=${event.executionMs}`])
          ].join(' ');
          logInferenceDebug(message, { environment, logger });
        }
      })
    : null;

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

  const runSerializedInference = operation => {
    const result = inferenceQueue.then(operation);
    inferenceQueue = result.catch(() => {});
    return result;
  };

  const runInference = (operation, options) => localWorkQueue
    ? localWorkQueue.enqueue(operation, options)
    : runSerializedInference(operation);

  const embed = async (texts, {
    signal,
    requestId,
    operation = 'embeddings'
  } = {}) => {
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
      const providerOperation = () => selectedProvider.embed(texts);
      return config.provider === 'qwen'
        ? runLocalInference(providerOperation, {
            priority: LOCAL_INFERENCE_PRIORITIES.embedding,
            requestId,
            operation: 'embeddings'
          })
        : providerOperation();
    }, { signal, requestId, operation });

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
    getQueueSnapshot: () => localWorkQueue?.getSnapshot() || null,
    initialize: () => selectedProvider.initialize()
  });
};

export default createEmbeddingService();
