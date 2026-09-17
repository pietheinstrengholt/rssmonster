import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { ISLAND_INACTIVITY_DAYS } from '../islands/islandDeadline.js';
import { loadIslandEvidence } from '../islands/islandInterestConfidence.js';
import { explainArticleInterests } from '../score/scoreArticlesFromIslands.js';

const BATCH_SIZE = 200;

// Cached scores cannot outlive their supporting Islands. This read-time correction
// uses the production evaluator without writing Articles or creating refresh jobs.
export async function refreshExpiredArticleInterests(userId, articles, now = Date.now()) {
  if (!articles.length) return;
  const oldest = articles.reduce((oldest, article) => {
    const time = article.interestScoredAt == null ? 0 : new Date(article.interestScoredAt).getTime();
    return Math.min(oldest, Number.isFinite(time) && time <= now ? time : 0);
  }, now);
  const inactivityMs = ISLAND_INACTIVITY_DAYS * 86400000;
  const boundary = await db.Island.findOne({
    where: { userId, [Op.or]: [
      { lastBehaviorAt: { [Op.between]: [new Date(oldest - inactivityMs), new Date(now - inactivityMs)] } },
      { archivedInd: true, archivedAt: { [Op.between]: [new Date(oldest), new Date(now)] } },
      { lastBehaviorAt: null },
      { lastBehaviorAt: { [Op.gt]: new Date(now) } },
      { archivedInd: true, archivedAt: null }
    ] }, attributes: ['id'], raw: true
  });
  if (!boundary) return;

  const context = await loadIslandEvidence(userId, { now });
  for (let start = 0; start < articles.length; start += BATCH_SIZE) {
    const batch = articles.slice(start, start + BATCH_SIZE);
    const rows = await db.Article.findAll({
      where: { userId, id: batch.map(article => article.id), ...canonicalArticleWhere(), filteredInd: false },
      attributes: ['id', 'title', 'description', 'articleVector', 'embedding_model',
        'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd'], raw: true
    });
    const { results } = await explainArticleInterests(userId, rows, { context });
    for (const article of batch) {
      const result = results.get(String(article.id));
      if (!result) continue;
      const values = { interestScore: result.score, interestScoredAt: new Date(now) };
      if (typeof article.setDataValue === 'function') {
        for (const [field, value] of Object.entries(values)) article.setDataValue(field, value);
      } else Object.assign(article, values);
    }
  }
}
