import { Op, Transaction } from 'sequelize';
import db from '../../models/index.js';
import { unfilteredCanonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { ISLAND_INACTIVITY_DAYS, islandBehaviorTime, islandReactivationBoundary } from '../islands/islandDeadline.js';
import { createRequestPersonalization } from './requestPersonalization.js';

const BATCH_SIZE = 200;

// Cached scores cannot outlive their supporting Islands. Refresh only evaluations
// that cross a lifecycle boundary and record them so later reads can reuse them.
export async function refreshExpiredArticleInterests(userId, articles, now = Date.now(), personalization = createRequestPersonalization(userId, now)) {
  personalization.assertUser(userId);
  now = personalization.now;
  if (!articles.length) return;
  const mysql = db.sequelize.getDialect() === 'mysql';
  const transactionOptions = db.sequelize.getDialect() === 'sqlite' ? { type: Transaction.TYPES.IMMEDIATE } : {};
  const evaluatedAt = new Date(mysql ? Math.floor(now / 1000) * 1000 : now);
  const evaluationTime = article => islandBehaviorTime(article.interestScoredAt, now) ?? 0;
  const evaluationValues = result => ({
    interestScore: mysql ? Math.fround(result.score) : result.score,
    interestScoredAt: evaluatedAt
  });
  const applyValues = (article, values) => {
    if (typeof article.setDataValue === 'function') {
      for (const [field, value] of Object.entries(values)) article.setDataValue(field, value);
    } else Object.assign(article, values);
  };

  // Ranking and reloaded details retain the request's evidence even after another
  // request or worker updates the persisted scores. Reuse never writes them again.
  const cached = articles.filter(article => personalization.hasEvaluation(article.id));
  if (cached.length) {
    const { results } = await personalization.explain([]);
    for (const article of cached) applyValues(article, evaluationValues(results.get(String(article.id))));
  }
  const pending = articles.filter(article => !personalization.hasEvaluation(article.id));
  if (!pending.length) return;
  const oldest = pending.reduce((oldest, article) => Math.min(oldest, evaluationTime(article)), now);
  const inactivityMs = ISLAND_INACTIVITY_DAYS * 86400000;
  const changedAt = { [Op.between]: [new Date(oldest), new Date(now)] };
  const islands = await db.Island.findAll({
    where: { userId, [Op.or]: [
      { lastBehaviorAt: { [Op.between]: [new Date(oldest - inactivityMs), new Date(now - inactivityMs)] } },
      { archivedInd: true, archivedAt: changedAt },
      { archivedInd: false, updatedAt: changedAt, [Op.or]: [
        { lastBehaviorAt: null }, { lastBehaviorAt: { [Op.gt]: new Date(now) } }
      ] },
      { archivedInd: true, updatedAt: changedAt, [Op.or]: [
        { archivedAt: null }, { archivedAt: { [Op.gt]: new Date(now) } }
      ] }
    ] }, attributes: ['lastBehaviorAt', 'archivedInd', 'archivedAt', 'updatedAt'], raw: true
  });
  const boundary = islands.reduce((latest, island) => {
    const unknownBoundary = island.archivedInd
      ? islandBehaviorTime(island.archivedAt, now) == null
      : islandBehaviorTime(island.lastBehaviorAt, now) == null;
    // updatedAt only invalidates malformed lifecycle state; it never grants activity.
    const time = unknownBoundary ? islandBehaviorTime(island.updatedAt, now) : islandReactivationBoundary(island, now);
    return time == null ? latest : Math.max(latest ?? time, time);
  }, null);
  if (boundary == null) return;
  // Equality stays conservative because persisted lifecycle clocks have second precision.
  const stale = pending.filter(article => evaluationTime(article) <= boundary);
  if (!stale.length) return;
  await personalization.explain([]);

  for (let start = 0; start < stale.length; start += BATCH_SIZE) {
    const batch = stale.slice(start, start + BATCH_SIZE);
    const valuesById = await db.sequelize.transaction(transactionOptions, async transaction => {
      const rows = await db.Article.findAll({
        where: { userId, id: batch.map(article => article.id), ...unfilteredCanonicalArticleWhere(), filteredInd: false },
        attributes: ['id', 'title', 'description', 'articleVector', 'embedding_model',
          'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'interestScore', 'interestScoredAt'],
        raw: true, transaction, lock: transaction.LOCK.UPDATE
      });
      // A competing refresh may have completed while this request waited for the lock.
      const { results } = await personalization.explain(rows.filter(row => evaluationTime(row) <= boundary));
      const groups = new Map();
      const values = new Map();
      for (const row of rows) {
        const result = results.get(String(row.id));
        if (!result) {
          values.set(String(row.id), {
            interestScore: row.interestScore,
            interestScoredAt: row.interestScoredAt == null ? null : new Date(row.interestScoredAt)
          });
          continue;
        }
        const refreshed = evaluationValues(result);
        values.set(String(row.id), refreshed);
        // Never overwrite a newer evaluation, including ambiguous same-second writes.
        if (row.interestScoredAt != null && new Date(row.interestScoredAt).getTime() >= evaluatedAt.getTime()) continue;
        if (!groups.has(refreshed.interestScore)) groups.set(refreshed.interestScore, []);
        groups.get(refreshed.interestScore).push(row.id);
      }
      for (const [interestScore, ids] of groups) {
        await db.Article.update({ interestScore, interestScoredAt: evaluatedAt }, {
          where: { userId, id: ids, ...unfilteredCanonicalArticleWhere(), filteredInd: false }, transaction, silent: true
        });
      }
      return values;
    });
    for (const article of batch) {
      const values = valuesById.get(String(article.id));
      if (values) applyValues(article, values);
    }
  }
}
