import db from '../../models/index.js';
import { PERSONALIZATION_REFRESH_TYPE, requestPersonalizationRefresh } from './personalizationRefresh.js';

const { User, ProcessingJob, sequelize, Sequelize: { Op, Transaction } } = db;
export const PERSONALIZATION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PERSONALIZATION_REFRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const PERSONALIZATION_REFRESH_BATCH_SIZE = 25;

// Keep empty accounts out, but include archived memory and stale scores needing clearing.
const hasPersonalization = sequelize.literal(`(
  EXISTS (SELECT 1 FROM islands WHERE islands.userId = users.id)
  OR EXISTS (SELECT 1 FROM articles WHERE articles.userId = users.id
    AND articles.filteredInd = 0 AND articles.duplicateOfArticleId IS NULL
    AND (articles.interestScore <> 0 OR (articles.articleVector IS NOT NULL
      AND (articles.positiveInd = 1 OR articles.negativeInd = 1 OR articles.favoriteInd = 1
        OR articles.clickedAmount > 0 OR articles.attentionBucket >= 3))))
)`);
// Dead/cancelled work stays visible for operator recovery; the timer cannot reset retry budgets.
const noOutstandingRefresh = sequelize.literal(`NOT EXISTS (
  SELECT 1 FROM processing_jobs WHERE processing_jobs.userId = users.id
    AND processing_jobs.type = 'personalization_refresh' AND processing_jobs.dedupeKey = 'current'
    AND processing_jobs.status <> 'succeeded'
)`);

export async function enqueueDuePersonalizationRefreshes({
  now = new Date(),
  maxAgeMs = PERSONALIZATION_REFRESH_INTERVAL_MS,
  checkIntervalMs = PERSONALIZATION_REFRESH_CHECK_INTERVAL_MS,
  limit = PERSONALIZATION_REFRESH_BATCH_SIZE
} = {}) {
  if (![maxAgeMs, checkIntervalMs, limit].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new TypeError('Personalization schedule values must be positive safe integers');
  }
  const batchSize = Math.min(limit, 1000);
  const cutoff = new Date(now.getTime() - maxAgeMs);
  const due = { [Op.or]: [{ personalizationRefreshedAt: null }, { personalizationRefreshedAt: { [Op.lte]: cutoff } }] };
  const users = await User.findAll({
    where: { ...due, [Op.and]: [hasPersonalization, noOutstandingRefresh] },
    attributes: ['id'], order: [['personalizationRefreshedAt', 'ASC'], ['id', 'ASC']], limit: batchSize
  });
  const queuedUserIds = [];
  for (const candidate of users) {
    const queued = await sequelize.transaction(
      sequelize.getDialect() === 'sqlite' ? { type: Transaction.TYPES.IMMEDIATE } : {}, async transaction => {
        // Use the same user → job lock order as behavior writes; recheck after acquiring it.
        const user = await User.findByPk(candidate.id, { transaction, lock: Transaction.LOCK.UPDATE });
        if (!user || (user.personalizationRefreshedAt && user.personalizationRefreshedAt > cutoff)) return false;
        const existing = await ProcessingJob.findOne({
          where: { userId: user.id, type: PERSONALIZATION_REFRESH_TYPE, dedupeKey: 'current' },
          transaction, lock: Transaction.LOCK.UPDATE
        });
        if (existing && existing.status !== 'succeeded') return false;
        const job = await requestPersonalizationRefresh(user.id, { transaction, triggerReasons: ['elapsed_time'] });
        // Spread each bounded batch across the check interval, retaining ordinary refresh priority.
        await job.update({ availableAt: new Date(now.getTime() + Math.floor(queuedUserIds.length * checkIntervalMs / batchSize)) }, { transaction });
        return true;
      });
    if (queued) queuedUserIds.push(candidate.id);
  }
  return { checkedCount: users.length, queuedUserIds };
}
