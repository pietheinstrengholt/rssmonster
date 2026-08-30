import {
  DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
  DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS
} from './crawlWorkerHealth.js';
import {
  createWorkerHealthReporter,
  parsePositiveIntegerConfig,
  readWorkerHealthState
} from './workerHealth.js';

export const DEFAULT_AI_WORKER_HEALTH_FILE = '/tmp/rssmonster-ai-worker-health.json';

export const getAiWorkerHealthConfig = (environment = process.env) => ({
  filePath: environment.AI_WORKER_HEALTH_FILE || DEFAULT_AI_WORKER_HEALTH_FILE,
  maxFailures: parsePositiveIntegerConfig(
    environment.AI_WORKER_HEALTH_MAX_FAILURES,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
    'AI_WORKER_HEALTH_MAX_FAILURES'
  ),
  maxStaleMs: parsePositiveIntegerConfig(
    environment.AI_WORKER_HEALTH_MAX_STALE_MS,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
    'AI_WORKER_HEALTH_MAX_STALE_MS'
  )
});

export const createAiWorkerHealthReporter = ({
  filePath = getAiWorkerHealthConfig().filePath,
  now = () => new Date()
} = {}) => createWorkerHealthReporter({ filePath, now });

export const evaluateAiWorkerHealth = (state, {
  maxFailures = DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
  maxStaleMs = DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
  now = Date.now()
} = {}) => {
  const updatedAt = Date.parse(state?.updatedAt);
  const consecutiveFailures = Number(state?.consecutiveFailures);
  const knownStatus = ['starting', 'running', 'healthy', 'degraded', 'paused', 'stopping'].includes(
    state?.status
  );
  if (!knownStatus || !Number.isFinite(updatedAt) || !Number.isInteger(consecutiveFailures)) {
    return { healthy: false, reason: 'invalid AI worker health state' };
  }
  if (state.status === 'stopping') return { healthy: false, reason: 'AI worker is stopping' };
  if (now - updatedAt > maxStaleMs) return { healthy: false, reason: 'AI worker health state is stale' };
  if (consecutiveFailures >= maxFailures) {
    return { healthy: false, reason: 'too many consecutive AI worker failures' };
  }
  return { healthy: true, reason: state.status };
};

export const readAiWorkerHealthState = async ({
  environment = process.env,
  now = Date.now()
} = {}) => {
  const config = getAiWorkerHealthConfig(environment);
  return readWorkerHealthState({
    filePath: config.filePath,
    evaluate: state => evaluateAiWorkerHealth(state, { ...config, now })
  });
};

export const checkAiWorkerHealth = async options => {
  const result = await readAiWorkerHealthState(options);
  return { healthy: result.healthy, reason: result.reason };
};
