import { col, fn, Op } from 'sequelize';
import db from '../../models/index.js';
import { sanitizeProcessingFailureMessage } from '../observability/processingFailures.js';
import {
  DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS
} from '../../src/workers/crawlWorkerHealth.js';
import { readAiWorkerHealthState } from '../../src/workers/aiWorkerHealth.js';

const { ProcessingJob } = db;
export const PROCESSING_JOB_STATUS_RECENT_FAILURE_LIMIT = 10;
export const PROCESSING_JOB_STATUS_LATENCY_SAMPLE_LIMIT = 500;
export const PROCESSING_JOB_STATUS_LATENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROCESSING_JOB_STATUS_DEGRADED_FAILURE_WINDOW_MS = 60 * 60 * 1000;
export const PROCESSING_JOB_STATUS_STALLED_AGE_MS =
  DEFAULT_CRAWL_WORKER_HEALTH_MAX_STALE_MS;
export const PROCESSING_JOB_STATUS_DEGRADED_RETRY_COUNT = 3;
const MAX_PUBLIC_ERROR_MESSAGE_LENGTH = 500;

const rowValue = (row, field) => typeof row?.getDataValue === 'function'
  ? row.getDataValue(field)
  : row?.[field];

const countValue = row => Number(rowValue(row, 'count') || 0);

const positiveUserId = value => {
  const userId = Number(value);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new TypeError('userId must be a positive integer');
  }
  return userId;
};

const startOfUtcDay = now => new Date(Date.UTC(
  now.getUTCFullYear(),
  now.getUTCMonth(),
  now.getUTCDate()
));

const emptyTypeStatus = type => ({
  type,
  pending: 0,
  running: 0,
  retrying: 0,
  dead: 0,
  cancelled: 0,
  completedToday: 0,
  failedToday: 0,
  oldestPendingAgeSeconds: null,
  averageProcessingLatencyMs: null
});

const workerStateAvailable = workerHealth => Boolean(
  workerHealth?.state &&
  !String(workerHealth.reason || '').includes('invalid') &&
  !String(workerHealth.reason || '').includes('stale')
);

const workerRunning = workerHealth => {
  if (!workerStateAvailable(workerHealth)) return false;
  const processingState = workerHealth.state.processingJobs;
  if (!processingState) {
    return !['disabled', 'stopping'].includes(workerHealth.state.status);
  }
  return processingState.enabled !== false &&
    !['disabled', 'stopping'].includes(processingState.status);
};

// Converts queue and worker evidence into one small presentation state.
export const deriveProcessingJobHealthStatus = ({
  summary,
  workerHealthy,
  workerRunning: running,
  mostRecentCompletionAt = null,
  mostRecentFailureAt = null,
  now = new Date()
}) => {
  const recentCompletionAge = mostRecentCompletionAt
    ? now.getTime() - new Date(mostRecentCompletionAt).getTime()
    : Number.POSITIVE_INFINITY;
  const oldRunnableBacklog = summary.oldestPendingAgeSeconds !== null &&
    summary.oldestPendingAgeSeconds * 1000 >= PROCESSING_JOB_STATUS_STALLED_AGE_MS;
  const hasActiveWork = summary.pending > 0 || summary.running > 0 || summary.retrying > 0;
  const recentFailureAge = mostRecentFailureAt
    ? now.getTime() - new Date(mostRecentFailureAt).getTime()
    : Number.POSITIVE_INFINITY;
  const hasRecentDeadJob = summary.dead > 0 && Number.isFinite(recentFailureAge) &&
    recentFailureAge <= PROCESSING_JOB_STATUS_DEGRADED_FAILURE_WINDOW_MS;

  if (summary.pending > 0 && (
    !running ||
    (oldRunnableBacklog && summary.running === 0 &&
      recentCompletionAge >= PROCESSING_JOB_STATUS_STALLED_AGE_MS)
  )) return 'stalled';
  if ((hasActiveWork && !workerHealthy) || hasRecentDeadJob ||
      summary.retrying >= PROCESSING_JOB_STATUS_DEGRADED_RETRY_COUNT) {
    return 'degraded';
  }
  if (summary.pending > 0 || summary.running > 0 || summary.retrying > 0) return 'busy';
  return 'healthy';
};

const readWorkerHealth = async reader => {
  try {
    return await reader();
  } catch {
    return {
      healthy: false,
      reason: 'worker health unavailable',
      state: null
    };
  }
};

// Uses only the dedicated AI-worker heartbeat; the crawl worker never consumes jobs.
export const readProcessingWorkerHealthState = options => readAiWorkerHealthState(options);

// Returns bounded, user-owned queue status without loading job payloads.
export const getProcessingJobStatus = async ({
  userId,
  now = new Date(),
  workerHealthReader = readProcessingWorkerHealthState
}) => {
  const normalizedUserId = positiveUserId(userId);
  const today = startOfUtcDay(now);
  const recentLatencyFrom = new Date(now.getTime() - PROCESSING_JOB_STATUS_LATENCY_WINDOW_MS);
  const ownedWhere = { userId: normalizedUserId };
  const [
    statusRows,
    retryRows,
    oldestPendingRows,
    todayRows,
    latencyRows,
    recentFailureRows,
    workerHealth
  ] = await Promise.all([
    ProcessingJob.findAll({
      attributes: [
        'type',
        'status',
        [fn('COUNT', col('id')), 'count']
      ],
      where: ownedWhere,
      group: ['type', 'status'],
      raw: true
    }),
    ProcessingJob.findAll({
      attributes: ['type', [fn('COUNT', col('id')), 'count']],
      where: {
        ...ownedWhere,
        status: 'pending',
        attempts: { [Op.gt]: 0 }
      },
      group: ['type'],
      raw: true
    }),
    ProcessingJob.findAll({
      attributes: ['type', [fn('MIN', col('createdAt')), 'oldestCreatedAt']],
      where: {
        ...ownedWhere,
        status: 'pending',
        availableAt: { [Op.lte]: now }
      },
      group: ['type'],
      raw: true
    }),
    ProcessingJob.findAll({
      attributes: [
        'type',
        'status',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        ...ownedWhere,
        status: { [Op.in]: ['succeeded', 'dead'] },
        completedAt: { [Op.gte]: today }
      },
      group: ['type', 'status'],
      raw: true
    }),
    ProcessingJob.findAll({
      attributes: ['type', 'startedAt', 'completedAt'],
      where: {
        ...ownedWhere,
        status: 'succeeded',
        startedAt: { [Op.not]: null },
        completedAt: { [Op.gte]: recentLatencyFrom }
      },
      order: [['completedAt', 'DESC'], ['id', 'DESC']],
      limit: PROCESSING_JOB_STATUS_LATENCY_SAMPLE_LIMIT,
      raw: true
    }),
    ProcessingJob.findAll({
      attributes: [
        'id', 'type', 'articleId', 'attempts', 'maxAttempts',
        'lastErrorCode', 'lastErrorMessage', 'completedAt'
      ],
      where: { ...ownedWhere, status: 'dead' },
      order: [['completedAt', 'DESC'], ['id', 'DESC']],
      limit: PROCESSING_JOB_STATUS_RECENT_FAILURE_LIMIT,
      raw: true
    }),
    readWorkerHealth(workerHealthReader)
  ]);

  const typesByName = new Map();
  const ensureType = type => {
    const normalizedType = String(type);
    if (!typesByName.has(normalizedType)) {
      typesByName.set(normalizedType, emptyTypeStatus(normalizedType));
    }
    return typesByName.get(normalizedType);
  };

  for (const row of statusRows) {
    const type = ensureType(row.type);
    if (Object.hasOwn(type, row.status)) type[row.status] = countValue(row);
  }
  for (const row of retryRows) ensureType(row.type).retrying = countValue(row);
  for (const row of oldestPendingRows) {
    const oldestCreatedAt = new Date(row.oldestCreatedAt);
    ensureType(row.type).oldestPendingAgeSeconds = Math.max(
      0,
      Math.floor((now.getTime() - oldestCreatedAt.getTime()) / 1000)
    );
  }
  for (const row of todayRows) {
    const type = ensureType(row.type);
    if (row.status === 'succeeded') type.completedToday = countValue(row);
    if (row.status === 'dead') type.failedToday = countValue(row);
  }

  const latenciesByType = new Map();
  for (const row of latencyRows) {
    const latency = new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime();
    if (!Number.isFinite(latency) || latency < 0) continue;
    const values = latenciesByType.get(row.type) || [];
    values.push(latency);
    latenciesByType.set(row.type, values);
    ensureType(row.type);
  }
  for (const [type, latencies] of latenciesByType) {
    typesByName.get(type).averageProcessingLatencyMs = Math.round(
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
    );
  }

  const types = [...typesByName.values()].sort((left, right) =>
    left.type.localeCompare(right.type));
  const summaryLatencies = [...latenciesByType.values()].flat();
  const runnableAges = types
    .map(type => type.oldestPendingAgeSeconds)
    .filter(age => age !== null);
  const summary = {
    pending: types.reduce((sum, type) => sum + type.pending, 0),
    running: types.reduce((sum, type) => sum + type.running, 0),
    retrying: types.reduce((sum, type) => sum + type.retrying, 0),
    dead: types.reduce((sum, type) => sum + type.dead, 0),
    cancelled: types.reduce((sum, type) => sum + type.cancelled, 0),
    completedToday: types.reduce((sum, type) => sum + type.completedToday, 0),
    failedToday: types.reduce((sum, type) => sum + type.failedToday, 0),
    oldestPendingAgeSeconds: runnableAges.length ? Math.max(...runnableAges) : null,
    averageProcessingLatencyMs: summaryLatencies.length
      ? Math.round(
          summaryLatencies.reduce((sum, latency) => sum + latency, 0) /
          summaryLatencies.length
        )
      : null
  };
  const running = workerRunning(workerHealth);
  const mostRecentCompletionAt = latencyRows[0]?.completedAt || null;
  const mostRecentFailureAt = recentFailureRows[0]?.completedAt || null;

  return {
    health: {
      status: deriveProcessingJobHealthStatus({
        summary,
        workerHealthy: workerHealth.healthy,
        workerRunning: running,
        mostRecentCompletionAt,
        mostRecentFailureAt,
        now
      }),
      workerRunning: running
    },
    summary,
    types,
    recentFailures: recentFailureRows.map(row => ({
      id: row.id,
      type: row.type,
      articleId: row.articleId,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.maxAttempts),
      errorCode: row.lastErrorCode,
      errorMessage: sanitizeProcessingFailureMessage(
        row.lastErrorMessage,
        MAX_PUBLIC_ERROR_MESSAGE_LENGTH
      ),
      completedAt: row.completedAt
    }))
  };
};

export default { deriveProcessingJobHealthStatus, getProcessingJobStatus };
