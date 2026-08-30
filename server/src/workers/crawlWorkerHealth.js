import {
  createWorkerHealthReporter,
  parsePositiveIntegerConfig,
  readWorkerHealthState
} from './workerHealth.js';

export const DEFAULT_CRAWL_WORKER_HEALTH_FILE =
  '/tmp/rssmonster-crawl-worker-health.json';
export const DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES = 3;
export const DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS = 15 * 60 * 1000;

export const getCrawlWorkerHealthConfig = (environment = process.env) => ({
  filePath: environment.CRAWL_WORKER_HEALTH_FILE || DEFAULT_CRAWL_WORKER_HEALTH_FILE,
  maxFailures: parsePositiveIntegerConfig(
    environment.CRAWL_WORKER_HEALTH_MAX_FAILURES,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
    'CRAWL_WORKER_HEALTH_MAX_FAILURES'
  ),
  maxStaleMs: parsePositiveIntegerConfig(
    environment.CRAWL_WORKER_HEALTH_MAX_STALE_MS,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
    'CRAWL_WORKER_HEALTH_MAX_STALE_MS'
  )
});

export const createCrawlWorkerHealthReporter = ({
  filePath = getCrawlWorkerHealthConfig().filePath,
  now = () => new Date()
} = {}) => createWorkerHealthReporter({ filePath, now });

export const evaluateCrawlWorkerHealth = (state, {
  maxFailures = DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
  maxStaleMs = DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
  now = Date.now()
} = {}) => {
  const updatedAt = Date.parse(state?.updatedAt);
  const crawlState = state?.crawl || state;
  const processingState = state?.processingJobs || null;
  const consecutiveFailures = Number(crawlState?.consecutiveFailures);
  const knownStatus = ['starting', 'running', 'healthy', 'degraded'].includes(state?.status);
  const knownCrawlStatus = ['starting', 'running', 'healthy', 'degraded'].includes(
    crawlState?.status
  );
  const knownProcessingStatus = !processingState || (
    processingState.enabled === false
      ? processingState.status === 'disabled'
      : ['starting', 'running', 'healthy', 'degraded', 'paused'].includes(
          processingState.status
        ) && Number.isInteger(Number(processingState.consecutiveFailures))
  );

  if (
    !knownStatus ||
    !knownCrawlStatus ||
    !knownProcessingStatus ||
    !Number.isFinite(updatedAt) ||
    !Number.isInteger(consecutiveFailures)
  ) {
    return { healthy: false, reason: 'invalid worker health state' };
  }
  if (now - updatedAt > maxStaleMs) {
    return { healthy: false, reason: 'worker health state is stale' };
  }
  if (consecutiveFailures >= maxFailures) {
    return { healthy: false, reason: 'too many consecutive crawl failures' };
  }
  if (
    processingState?.enabled !== false &&
    Number(processingState?.consecutiveFailures) >= maxFailures
  ) {
    return { healthy: false, reason: 'too many consecutive processing-job failures' };
  }

  return { healthy: true, reason: state.status };
};

export const checkCrawlWorkerHealth = async ({
  environment = process.env,
  now = Date.now()
} = {}) => {
  const result = await readCrawlWorkerHealthState({ environment, now });
  return { healthy: result.healthy, reason: result.reason };
};

// Reads the evaluated state for authenticated operational status consumers.
export const readCrawlWorkerHealthState = async ({
  environment = process.env,
  now = Date.now()
} = {}) => {
  const config = getCrawlWorkerHealthConfig(environment);
  return readWorkerHealthState({
    filePath: config.filePath,
    evaluate: state => evaluateCrawlWorkerHealth(state, { ...config, now })
  });
};
