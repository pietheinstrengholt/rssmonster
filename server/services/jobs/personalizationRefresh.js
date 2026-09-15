import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { enqueueProcessingJob } from './processingJobQueue.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { scoreArticlesFromIslandsForUser } from '../score/scoreArticlesFromIslands.js';
import { runIslandCalibrationForUser } from '../islands/runIslandCalibration.js';

export const EXPLICIT_FEEDBACK_REFRESH_TYPE = 'explicit_feedback_refresh';
export const isPersonalizationRefreshType = type => [PERSONALIZATION_REFRESH_TYPE, EXPLICIT_FEEDBACK_REFRESH_TYPE].includes(type);
export const PERSONALIZATION_REFRESH_TYPE = 'personalization_refresh';
export const PERSONALIZATION_REFRESH_DELAY_MS = 2000;
const { ProcessingJob, User, sequelize, Sequelize: { Op } } = db;

// The caller holds the user lock in the same transaction as the behavior write.
async function requestRefresh(userId, { transaction, type = PERSONALIZATION_REFRESH_TYPE, articleId = null, triggerReasons = [] }) {
  const fast = type === EXPLICIT_FEEDBACK_REFRESH_TYPE;
  const dedupeKey = fast ? `article:${articleId}` : 'current';
  const existing = await ProcessingJob.findOne({
    where: { userId, type, dedupeKey }, transaction
  });
  // Lock before terminal reactivation; completion may race the initial lookup.
  if (existing) await existing.reload({ transaction, lock: transaction.LOCK.UPDATE });
  const { job } = await enqueueProcessingJob({
    userId, type, articleId, dedupeKey,
    priority: fast ? 20 : 10, availableAt: new Date(Date.now() + (fast ? 0 : PERSONALIZATION_REFRESH_DELAY_MS))
  }, { transaction, reactivateTerminal: true });
  await job.reload({ transaction, lock: transaction.LOCK.UPDATE });
  // Keep the first pending deadline: continuous activity must not starve refreshes.
  await job.update({ payload: { ...job.payload, requestId: randomUUID(),
    triggerReasons: [...new Set([...(job.payload.triggerReasons || []), ...triggerReasons])]
  } }, { transaction });
  return job;
}

export const requestPersonalizationRefresh = (userId, options) => requestRefresh(userId, options);
export const requestExplicitFeedbackRefresh = (userId, articleId, options) => requestRefresh(userId, {
  ...options, type: EXPLICIT_FEEDBACK_REFRESH_TYPE, articleId
});

export async function handleExplicitFeedbackRefresh(job, { assertLease }) {
  await assertLease();
  if (!job.articleId) { logRefresh(job, { skipReason: 'missing-source' }); return; }
  const source = await db.Article.findOne({ where: {
    id: job.articleId, userId: job.userId, ...canonicalArticleWhere(), filteredInd: false
  }, attributes: ['id', 'articleVector', 'embedding_model'] });
  if (!source?.articleVector) { logRefresh(job, { skipReason: 'missing-source-vector' }); return; }
  const result = await scoreArticlesFromIslandsForUser(job.userId, { relatedToArticle: source, assertLease });
  logRefresh(job, { calibrationDurationMs: 0, islandsChanged: 0, ...result });
  return result;
}

const islandSnapshot = async userId => new Map((await db.Island.findAll({
  where: { userId }, attributes: ['id', 'weight', 'islandVector', 'positiveSignals', 'archivedInd'],
  order: [['id', 'ASC']], raw: true
})).map(island => [String(island.id), JSON.stringify(island)]));

const logRefresh = (job, result) => console.log('[PERSONALIZATION REFRESH]', JSON.stringify({
  userId: job.userId, jobId: job.id, type: job.type,
  triggerReasons: job.payload?.triggerReasons || [],
  calibrationDurationMs: result.calibrationDurationMs || 0,
  islandsChanged: result.islandsChanged || 0,
  candidatesRescored: result.candidatesRescored || 0,
  interestScoresChanged: result.interestScoresChanged || 0,
  calibrationReused: Boolean(result.calibrationReused),
  ...(result.skipReason ? { skipReason: result.skipReason } : {})
}));

export async function handlePersonalizationRefresh(job, { assertLease }) {
  await assertLease();
  if (!await User.findByPk(job.userId, { attributes: ['id'] })) return;
  const current = await ProcessingJob.findByPk(job.id);
  const checkpoint = current?.payload?.calibration;
  const persistedCalibration = checkpoint?.requestId === job.payload.requestId ? checkpoint : null;
  const before = persistedCalibration ? null : await islandSnapshot(job.userId);
  const result = await runIslandCalibrationForUser(job.userId, {
    persistedCalibration, assertLease, generateLabels: false,
    afterPersist: async (transaction, summary) => {
      const owned = await ProcessingJob.findOne({ where: {
        id: job.id, userId: job.userId, status: 'running', leaseOwner: job.leaseOwner,
        leaseUntil: { [Op.gt]: new Date() }
      }, transaction, lock: transaction.LOCK.UPDATE });
      if (!owned) throw Object.assign(new Error('Calibration lease lost'), { code: 'PROCESSING_JOB_LEASE_LOST' });
      // Commit the checkpoint with the Islands, preserving requests received mid-run.
      await owned.update({ payload: { ...owned.payload,
        calibration: { ...summary, requestId: job.payload.requestId }
      } }, { transaction });
    }
  });
  const after = before ? await islandSnapshot(job.userId) : null;
  const islandsChanged = before ? [...new Set([...before.keys(), ...after.keys()])]
    .filter(id => before.get(id) !== after.get(id)).length : 0;
  logRefresh(job, { ...result, islandsChanged, calibrationReused: Boolean(persistedCalibration) });
  return result;
}

// Compare and release under one lock so an action racing completion is never lost.
export async function completePersonalizationRefresh(job, leaseOwner) {
  return sequelize.transaction(
    sequelize.getDialect() === 'sqlite' ? { type: db.Sequelize.Transaction.TYPES.IMMEDIATE } : {}, async transaction => {
    const current = await ProcessingJob.findOne({ where: {
      id: job.id, userId: job.userId, type: job.type,
      status: 'running', leaseOwner, leaseUntil: { [Op.gt]: new Date() }
    }, transaction, lock: transaction.LOCK.UPDATE });
    if (!current) return null;
    const status = current.payload.requestId === job.payload.requestId ? 'succeeded' : 'pending';
    await current.update({
      status, leaseOwner: null, leaseUntil: null,
      lastErrorCode: null, lastErrorMessage: null,
      ...(status === 'pending'
        ? { attempts: 0, availableAt: new Date(Date.now() + (job.type === EXPLICIT_FEEDBACK_REFRESH_TYPE ? 0 : PERSONALIZATION_REFRESH_DELAY_MS)), startedAt: null, completedAt: null }
        : { completedAt: new Date() })
    }, { transaction });
    return status;
    }
  );
}
