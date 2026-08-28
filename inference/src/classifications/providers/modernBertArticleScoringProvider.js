import { pipeline } from '@huggingface/transformers';
import { getArticleScoringConfig } from '../../config/config.js';
import { configureModelCache } from '../../embeddings/modelCache.js';
import { logInferenceDebug } from '../../debug.js';
import { createInferenceWorkQueue } from '../../queue/inferenceWorkQueue.js';
import {
  LOCAL_INFERENCE_PRIORITIES,
  runLocalInference
} from '../../queue/localInferencePriorityGate.js';

const MODEL_DEVICE = 'cpu';
const QUEUE_EVENT_STAGES = Object.freeze({
  queued: 'queued',
  started: 'inference_started',
  completed: 'inference_completed',
  failed: 'inference_failed',
  aborted_pending: 'client_aborted_pending',
  aborted_running: 'client_aborted_running',
  rejected_full: 'overload_rejected'
});

const dimensions = [
  {
    key: 'advertisementScore',
    labels: ['purely editorial', 'partly promotional', 'strongly promotional'],
    values: [100, 70, 20]
  },
  {
    key: 'sentimentScore',
    labels: ['neutral and calm', 'mildly opinionated', 'strongly emotionally charged'],
    values: [100, 70, 20]
  },
  {
    key: 'qualityScore',
    labels: ['high-quality informative writing', 'average-quality writing', 'poor-quality writing'],
    values: [100, 70, 20]
  }
];

const bucketScore = value => [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  .reduce((previous, current) =>
    Math.abs(current - value) < Math.abs(previous - value) ? current : previous
  );

const scoreResult = (result, dimension) => {
  const scoresByLabel = new Map(result.labels.map((label, index) => [label, result.scores[index]]));
  const weightedScore = dimension.labels.reduce((total, label, index) =>
    total + (Number(scoresByLabel.get(label)) || 0) * dimension.values[index], 0
  );
  return bucketScore(weightedScore);
};

const defaultDependencies = {
  configureCache: configureModelCache,
  loadClassifier: (modelId, dtype) => pipeline('zero-shot-classification', modelId, {
    dtype,
    device: MODEL_DEVICE
  }),
  logger: console
};

export const createModernBertArticleScoringProvider = ({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) => {
  const config = getArticleScoringConfig({
    ...environment,
    ARTICLE_SCORING_PROVIDER: 'modernbert'
  });
  let classifier;
  let initializationPromise;
  const scoringQueue = createInferenceWorkQueue({
    concurrency: 1,
    maximumPending: config.queueMaxPending,
    onEvent: event => {
      const message = [
        `article-scoring-queue stage=${QUEUE_EVENT_STAGES[event.type] || event.type}`,
        `requestId=${JSON.stringify(event.requestId || 'unavailable')}`,
        `operation=${JSON.stringify(event.operation || 'article-scoring')}`,
        `running=${event.running}`,
        `pending=${event.pending}`,
        ...(event.queueWaitMs === undefined ? [] : [`queueWaitMs=${event.queueWaitMs}`]),
        ...(event.executionMs === undefined ? [] : [`executionMs=${event.executionMs}`])
      ].join(' ');
      logInferenceDebug(message, { environment, logger: dependencies.logger });
    }
  });

  const initialize = async () => {
    if (classifier) return;
    if (!initializationPromise) {
      initializationPromise = (async () => {
        dependencies.logger.log(`[INFERENCE] Loading article scoring model ${config.modelId}`);
        await dependencies.configureCache(environment);
        classifier = await dependencies.loadClassifier(config.modelId, config.dtype);
        dependencies.logger.log(`[INFERENCE] Loaded article scoring model ${config.modelId}`);
      })();
    }
    await initializationPromise;
  };

  const runScoring = async ({ text, title, feedName }) => {
    await initialize();
    const input = [
      `Feed: ${feedName || 'unknown'}`,
      `Title: ${title || ''}`,
      text
    ].join('\n');
    const scores = {};

    for (const dimension of dimensions) {
      const result = await classifier(input, dimension.labels, {
        hypothesis_template: 'This article is {}.',
        multi_label: false
      });
      scores[dimension.key] = scoreResult(result, dimension);
    }
    return scores;
  };

  const score = ({ signal, requestId, operation = 'article-scoring', ...input }) =>
    scoringQueue.enqueue(
      () => runLocalInference(
        () => runScoring(input),
        {
          priority: LOCAL_INFERENCE_PRIORITIES.scoring,
          requestId,
          operation
        }
      ),
      { signal, requestId, operation }
    );

  return Object.freeze({
    initialize,
    score,
    getQueueSnapshot: scoringQueue.getSnapshot,
    getMetadata: () => Object.freeze({
      provider: 'modernbert',
      modelId: config.modelId,
      dtype: config.dtype,
      device: MODEL_DEVICE,
      task: 'zero-shot-classification'
    }),
    isLoaded: () => Boolean(classifier)
  });
};

export default createModernBertArticleScoringProvider();
