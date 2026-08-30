import db from '../../models/index.js';
import { col, fn, Op } from 'sequelize';
import { getModelValue as rowValue } from '../../utils/modelValue.js';

const { ProcessingFailure, ProcessingJob } = db;
const DEFAULT_LATENCY_SAMPLE_LIMIT = 500;
const MAX_LATENCY_SAMPLE_LIMIT = 1000;

const boundedLimit = value => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LATENCY_SAMPLE_LIMIT;
  return Math.min(parsed, MAX_LATENCY_SAMPLE_LIMIT);
};

const countValue = row => Number(rowValue(row, 'count') || 0);

// Returns durable queue depth and bounded completion-latency metrics without loading payloads.
export const loadProcessingJobOperationalSnapshot = async ({
  now = new Date(),
  latencySampleLimit = DEFAULT_LATENCY_SAMPLE_LIMIT
} = {}) => {
  const [
    pendingGroups,
    oldestPending,
    runningCount,
    retryCount,
    deadJobCount,
    completionCount,
    failureCount,
    latencyRows
  ] = await Promise.all([
    ProcessingJob.findAll({
      attributes: [
        'type',
        [fn('COUNT', col('id')), 'count']
      ],
      where: { status: 'pending' },
      group: ['type'],
      raw: true
    }),
    ProcessingJob.findOne({
      attributes: ['createdAt'],
      where: { status: 'pending' },
      order: [['createdAt', 'ASC']]
    }),
    ProcessingJob.count({ where: { status: 'running' } }),
    ProcessingJob.count({
      where: { status: 'pending', attempts: { [Op.gt]: 0 } }
    }),
    ProcessingJob.count({ where: { status: 'dead' } }),
    ProcessingJob.count({ where: { status: 'succeeded' } }),
    ProcessingFailure.count({
      where: { stage: { [Op.in]: ['article_enrichment', 'semantic_label'] } }
    }),
    ProcessingJob.findAll({
      attributes: ['startedAt', 'completedAt'],
      where: {
        status: { [Op.in]: ['succeeded', 'dead'] },
        startedAt: { [Op.not]: null },
        completedAt: { [Op.not]: null }
      },
      order: [['completedAt', 'DESC']],
      limit: boundedLimit(latencySampleLimit),
      raw: true
    })
  ]);

  const pendingByType = Object.fromEntries(pendingGroups
    .map(row => [String(rowValue(row, 'type')), countValue(row)])
    .sort(([left], [right]) => left.localeCompare(right)));
  const oldestCreatedAt = rowValue(oldestPending, 'createdAt');
  const latencies = latencyRows
    .map(row => new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime())
    .filter(value => Number.isFinite(value) && value >= 0);

  return {
    event: 'processing_jobs.snapshot',
    observedAt: now.toISOString(),
    pendingByType,
    oldestPendingJobAgeMs: oldestCreatedAt
      ? Math.max(0, now.getTime() - new Date(oldestCreatedAt).getTime())
      : null,
    runningCount: Number(runningCount),
    retryCount: Number(retryCount),
    deadJobCount: Number(deadJobCount),
    completionCount: Number(completionCount),
    failureCount: Number(failureCount),
    processingLatencyMs: {
      sampleSize: latencies.length,
      average: latencies.length
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
      maximum: latencies.length ? Math.max(...latencies) : null
    }
  };
};

export default { loadProcessingJobOperationalSnapshot };
