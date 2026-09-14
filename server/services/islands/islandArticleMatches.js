import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { cosineSimilarity } from '../vectors/index.js';
import { resolveIslandArticleScoreThreshold } from '../score/scoreArticlesFromIslands.js';

// Structural affinity is independent of signed preference and does not require an Event.
export const matchingArticleIslands = (article, islands, threshold = resolveIslandArticleScoreThreshold()) =>
  islands.filter(island => cosineSimilarity(article.articleVector, island.islandVector, {
    parseStrings: true, coerceNumbers: true
  }) > threshold);

// Apply ownership and all available database predicates before bounded vector batches.
export async function collectArticleIslandMatches(userId, { where = {}, onBatch } = {}) {
  const islands = await db.Island.findAll({
    where: { userId, archivedInd: false }, attributes: ['id', 'islandVector'], raw: true
  });
  const matchedIds = [];
  if (!islands.length) return matchedIds;
  let afterId = 0;
  while (true) {
    const articles = await db.Article.findAll({
      where: { [Op.and]: [where, { userId, ...canonicalArticleWhere(), filteredInd: false,
        articleVector: { [Op.ne]: null }, id: { [Op.gt]: afterId } }] },
      attributes: ['id', 'articleVector'], order: [['id', 'ASC']], limit: 200, raw: true
    });
    if (!articles.length) break;
    const matches = articles.map(article => ({ articleId: article.id, islands: matchingArticleIslands(article, islands) }))
      .filter(match => match.islands.length);
    matchedIds.push(...matches.map(match => match.articleId));
    await onBatch?.(matches);
    afterId = articles.at(-1).id;
  }
  return matchedIds;
}
