import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { cosineSimilarity } from '../vectors/index.js';
import { DEFAULT_ARTICLE_AFFINITY_THRESHOLD, ISLAND_DEBUG } from '../islands/islandVectorUtils.js';
import { evaluateArticleInterest, loadIslandEvidence, prepareIslandEvidence } from '../islands/islandInterestConfidence.js';

const { Article } = db;
const ARTICLE_BATCH_SIZE = 200;

export function resolveIslandArticleScoreThreshold(value = process.env.ISLAND_ARTICLE_SCORE_THRESHOLD) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 1 ? parsed : 0.62;
}

// Compatibility helper: direct matching uses the same confidence formula as persisted scoring.
export function strongestIslandScore(articleVector, islands, threshold) {
  const prepared = islands.every(i => i.islandConfidence != null) ? islands : prepareIslandEvidence(islands, []).islands;
  const result = evaluateArticleInterest({ articleVector }, { islands: prepared, fallbackEvidence: [] }, threshold);
  const path = result.paths[0];
  return path ? { islandId: path.islandId, score: result.score } : null;
}

// Shared by write-side scoring and read-side explanations; no alternate attribution formula.
export async function explainArticleInterests(userId, articles, options = {}) {
  const context = options.context || await loadIslandEvidence(userId, options);
  const results = new Map(articles.map(article => [String(article.id), evaluateArticleInterest(article, context, options.articleScoreThreshold ?? resolveIslandArticleScoreThreshold())]));
  return { context, results };
}

// Refresh all eligible unread scores, including neutral articles without vectors or relationships.
export async function scoreArticlesFromIslandsForUser(userId, options = {}) {
  const { createdAtFrom, transaction } = options;
  const context = await loadIslandEvidence(userId, options);
  const threshold = options.articleScoreThreshold ?? resolveIslandArticleScoreThreshold();
  const similarity = (a, b) => cosineSimilarity(a, b, { parseStrings: true, coerceNumbers: true });
  // Feedback can also change support confidence for existing matching Islands.
  const relatedVectors = options.relatedToArticle ? [options.relatedToArticle.articleVector,
    ...context.islands.filter(island => similarity(options.relatedToArticle.articleVector, island.islandVector)
      >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD).map(island => island.islandVector)
  ] : null;
  const summary = { userId, fallbackScoredCount: 0, behavioralScoredCount: 0, updatedCount: 0, candidatesRescored: 0, interestScoresChanged: 0 };
  let afterId = 0;
  while (true) {
    await options.assertLease?.();
    const batch = await Article.findAll({ where: {
      userId, status: 'unread', ...canonicalArticleWhere(), filteredInd: false, id: { [Op.gt]: afterId },
      ...(createdAtFrom ? { createdAt: { [Op.gte]: createdAtFrom } } : {})
    }, attributes: ['title', 'description', 'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'id', 'articleVector', 'interestScore', 'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket'],
    order: [['id', 'ASC']], limit: ARTICLE_BATCH_SIZE, transaction });
    if (!batch.length) break;
    afterId = batch.at(-1).id;
    const articles = relatedVectors
      ? batch.filter(article => relatedVectors.some(vector => similarity(article.articleVector, vector) > threshold))
      : batch;
    const { results } = await explainArticleInterests(userId, articles, { ...options, context });
    for (const article of articles) {
      const result = results.get(String(article.id));
      summary.candidatesRescored++;
      const stored = Number(article.interestScore);
      // MySQL FLOAT stores single precision; compare at that exact storage precision.
      const unchanged = stored === result.score || (db.sequelize.getDialect() === 'mysql'
        && Math.fround(stored) === Math.fround(result.score));
      if (!unchanged) {
        const [changed] = await Article.update({ interestScore: result.score }, {
          where: { id: article.id, userId, status: 'unread', ...canonicalArticleWhere(), filteredInd: false }, transaction
        });
        summary.interestScoresChanged += Number(changed);
      }
      if (result.score !== 0) {
        summary.updatedCount++;
        if (result.paths.some(p => p.matchType === 'vector-fallback')) summary.fallbackScoredCount++;
        if (result.paths.some(p => p.matchType === 'behavioral-fallback')) summary.behavioralScoredCount++;
      }
      if (ISLAND_DEBUG && result.paths.length) console.log('[ISLAND INTEREST]', JSON.stringify({ articleId: article.id, ...result }));
    }
  }
  return summary;
}

export default scoreArticlesFromIslandsForUser;
