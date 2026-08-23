import { readFile, rename, writeFile } from 'node:fs/promises';

export const DEFAULT_CRAWL_WORKER_HEALTH_FILE =
  '/tmp/rssmonster-crawl-worker-health.json';
export const DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES = 3;
export const DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS = 15 * 60 * 1000;

const positiveInteger = (value, fallback, name) => {
  if (typeof value === 'undefined' || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
};

export const getCrawlWorkerHealthConfig = (environment = process.env) => ({
  filePath: environment.CRAWL_WORKER_HEALTH_FILE || DEFAULT_CRAWL_WORKER_HEALTH_FILE,
  maxFailures: positiveInteger(
    environment.CRAWL_WORKER_HEALTH_MAX_FAILURES,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
    'CRAWL_WORKER_HEALTH_MAX_FAILURES'
  ),
  maxStaleMs: positiveInteger(
    environment.CRAWL_WORKER_HEALTH_MAX_STALE_MS,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
    'CRAWL_WORKER_HEALTH_MAX_STALE_MS'
  )
});

export const createCrawlWorkerHealthReporter = ({
  filePath = getCrawlWorkerHealthConfig().filePath,
  now = () => new Date()
} = {}) => async state => {
  const persistedState = {
    ...state,
    updatedAt: now().toISOString()
  };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(persistedState)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
  return persistedState;
};

export const evaluateCrawlWorkerHealth = (state, {
  maxFailures = DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
  maxStaleMs = DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
  now = Date.now()
} = {}) => {
  const updatedAt = Date.parse(state?.updatedAt);
  const consecutiveFailures = Number(state?.consecutiveFailures);
  const knownStatus = ['starting', 'running', 'healthy', 'degraded'].includes(state?.status);

  if (!knownStatus || !Number.isFinite(updatedAt) || !Number.isInteger(consecutiveFailures)) {
    return { healthy: false, reason: 'invalid worker health state' };
  }
  if (now - updatedAt > maxStaleMs) {
    return { healthy: false, reason: 'worker health state is stale' };
  }
  if (consecutiveFailures >= maxFailures) {
    return { healthy: false, reason: 'too many consecutive crawl failures' };
  }

  return { healthy: true, reason: state.status };
};

export const checkCrawlWorkerHealth = async ({
  environment = process.env,
  now = Date.now()
} = {}) => {
  const config = getCrawlWorkerHealthConfig(environment);
  const state = JSON.parse(await readFile(config.filePath, 'utf8'));
  return evaluateCrawlWorkerHealth(state, { ...config, now });
};
