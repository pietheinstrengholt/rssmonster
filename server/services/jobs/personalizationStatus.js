import { Op } from 'sequelize';
import db from '../../models/index.js';

const elapsed = (end, start) => {
  if (!end || !start) return null;
  const value = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(value) && value >= 0 ? value : null;
};

// A reusable job's createdAt is its first-ever run, not the current feedback request.
export function describePersonalizationRefresh(job, now = new Date()) {
  if (!job) return { state: 'untracked', lastCompletedAt: null, refreshAgeMs: null };
  const requestAt = job.payload?.latestRequestedAt ?? null;
  const last = job.payload?.lastCompletedRefresh;
  const completedAt = last?.completedAt ?? (job.status === 'succeeded' ? job.completedAt : null);
  return {
    state: ({ succeeded: 'completed', dead: 'failed' })[job.status] || job.status,
    jobId: job.id, articleId: job.articleId ?? null,
    latestRequestedAt: requestAt, requestAgeMs: elapsed(now, requestAt),
    attempts: Number(job.attempts || 0), lastErrorCode: job.lastErrorCode ?? null,
    lastCompletedAt: completedAt, refreshAgeMs: elapsed(now, completedAt),
    lastCompletedEvaluation: { candidatesRescored: last?.candidatesRescored ?? null,
      interestScoresChanged: last?.interestScoresChanged ?? null, skipReason: last?.skipReason ?? null },
    lastCompletedLatency: {
      queueWaitMs: elapsed(last?.startedAt, last?.requestedAt),
      processingMs: elapsed(last?.completedAt, last?.startedAt),
      requestToCompletionMs: elapsed(last?.completedAt, last?.requestedAt)
    }
  };
}

export async function loadPersonalizationStatus(userId, now = new Date()) {
  const attributes = ['id', 'articleId', 'status', 'payload', 'attempts', 'lastErrorCode', 'startedAt', 'completedAt'];
  const [durable, explicit] = await Promise.all([
    db.ProcessingJob.findOne({ where: { userId, type: 'personalization_refresh', dedupeKey: 'current' }, attributes, raw: true }),
    db.ProcessingJob.findAll({ where: { userId, type: 'explicit_feedback_refresh',
      status: { [Op.in]: ['pending', 'running', 'succeeded', 'dead'] } }, attributes,
    order: [['updatedAt', 'DESC'], ['id', 'DESC']], limit: 10, raw: true })
  ]);
  return { observedAt: now.toISOString(), durable: describePersonalizationRefresh(durable, now),
    recentExplicit: explicit.map(job => describePersonalizationRefresh(job, now)), explicitSampleLimit: 10 };
}
