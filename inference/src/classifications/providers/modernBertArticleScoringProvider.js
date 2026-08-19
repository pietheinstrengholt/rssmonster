import { pipeline } from '@huggingface/transformers';
import { getArticleScoringConfig } from '../../config/config.js';
import { configureModelCache } from '../../embeddings/modelCache.js';

const MODEL_DEVICE = 'cpu';

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
  let scoringQueue = Promise.resolve();

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

  const score = input => {
    const result = scoringQueue.then(() => runScoring(input));
    scoringQueue = result.catch(() => {});
    return result;
  };

  return Object.freeze({
    initialize,
    score,
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
