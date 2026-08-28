import { readFile, rename, writeFile } from 'node:fs/promises';
import {
  DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
  DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS
} from './crawlWorkerHealth.js';

export const DEFAULT_AI_WORKER_HEALTH_FILE = '/tmp/rssmonster-ai-worker-health.json';

const positiveInteger = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
};

export const getAiWorkerHealthConfig = (environment = process.env) => ({
  filePath: environment.AI_WORKER_HEALTH_FILE || DEFAULT_AI_WORKER_HEALTH_FILE,
  maxFailures: positiveInteger(
    environment.AI_WORKER_HEALTH_MAX_FAILURES,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_FAILURES,
    'AI_WORKER_HEALTH_MAX_FAILURES'
  ),
  maxStaleMs: positiveInteger(
    environment.AI_WORKER_HEALTH_MAX_STALE_MS,
    DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS,
    'AI_WORKER_HEALTH_MAX_STALE_MS'
  )
});

export const createAiWorkerHealthReporter = ({
  filePath = getAiWorkerHealthConfig().filePath,
  now = () => new Date()
} = {}) => async state => {
  const persistedState = { ...state, updatedAt: now().toISOString() };
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(persistedState)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
  return persistedState;
};

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
  const state = JSON.parse(await readFile(config.filePath, 'utf8'));
  return { ...evaluateAiWorkerHealth(state, { ...config, now }), state };
};

export const checkAiWorkerHealth = async options => {
  const result = await readAiWorkerHealthState(options);
  return { healthy: result.healthy, reason: result.reason };
};
