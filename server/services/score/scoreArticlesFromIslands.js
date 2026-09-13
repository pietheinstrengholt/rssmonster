import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { ISLAND_DEBUG } from '../islands/islandVectorUtils.js';
import { evaluateArticleInterest, loadIslandEvidence, prepareIslandEvidence } from '../islands/islandInterestConfidence.js';

const { Article, ArticleTopic, IslandTopic, Topic, Sequelize: { Op } } = db;
const ARTICLE_BATCH_SIZE = 200;

export function resolveIslandArticleScoreThreshold(value = process.env.ISLAND_ARTICLE_SCORE_THRESHOLD) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 1 ? parsed : 0.62;
}

// Compatibility helper: direct matching uses the same confidence formula as persisted scoring.
export function strongestIslandScore(articleVector, islands, threshold) {
  const prepared = islands.every(i => i.islandConfidence != null) ? islands : prepareIslandEvidence(islands, []).islands;
  const result = evaluateArticleInterest({ articleVector }, { islands: prepared, fallbackEvidence: [] }, [], [], threshold);
  const path = result.paths[0];
  return path ? { islandId: path.islandId, score: result.score } : null;
}

// Shared by write-side scoring and read-side explanations; no alternate attribution formula.
export async function explainArticleInterests(userId, articles, options = {}) {
  const context = options.context || await loadIslandEvidence(userId, options);
  const ids = articles.map(a => a.id);
  const articleTopics = ids.length ? await ArticleTopic.findAll({
    where: { articleId: { [Op.in]: ids } },
    include: [{ model: Article, required: true, attributes: [], where: { userId } },
      { model: Topic, required: true, attributes: [], where: { userId } }],
    attributes: ['articleId', 'topicId', 'confidence'], raw: true, transaction: options.transaction
  }) : [];
  const islandTopics = context.islands.length ? await IslandTopic.findAll({
    where: { islandId: context.islands.map(i => i.id) }, attributes: ['islandId', 'topicId', 'confidence', 'similarity'],
    raw: true, transaction: options.transaction
  }) : [];
  const byArticle = new Map();
  for (const row of articleTopics) {
    if (!byArticle.has(row.articleId)) byArticle.set(row.articleId, []);
    byArticle.get(row.articleId).push(row);
  }
  const results = new Map(articles.map(article => [String(article.id), evaluateArticleInterest(article, context,
    byArticle.get(article.id) || [], islandTopics, options.articleScoreThreshold ?? resolveIslandArticleScoreThreshold())]));
  return { context, results };
}

// Refresh all eligible unread scores, including neutral articles without vectors or relationships.
export async function scoreArticlesFromIslandsForUser(userId, options = {}) {
  const { createdAtFrom, transaction } = options;
  const context = await loadIslandEvidence(userId, options);
  const summary = { userId, topicScoredCount: 0, fallbackScoredCount: 0, behavioralScoredCount: 0, updatedCount: 0 };
  let afterId = 0;
  while (true) {
    const articles = await Article.findAll({ where: {
      userId, status: 'unread', ...canonicalArticleWhere(), filteredInd: false, id: { [Op.gt]: afterId },
      ...(createdAtFrom ? { createdAt: { [Op.gte]: createdAtFrom } } : {})
    }, attributes: ['title', 'description', 'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'id', 'articleVector', 'interestScore', 'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket'],
    order: [['id', 'ASC']], limit: ARTICLE_BATCH_SIZE, transaction });
    if (!articles.length) break;
    const { results } = await explainArticleInterests(userId, articles, { ...options, context });
    for (const article of articles) {
      const result = results.get(String(article.id));
      if (Number(article.interestScore) !== result.score) await article.update({ interestScore: result.score }, { transaction });
      if (result.score !== 0) {
        summary.updatedCount++;
        if (result.paths.some(p => p.matchType === 'topic-island')) summary.topicScoredCount++;
        if (result.paths.some(p => p.matchType === 'vector-fallback')) summary.fallbackScoredCount++;
        if (result.paths.some(p => p.matchType === 'behavioral-fallback')) summary.behavioralScoredCount++;
      }
      if (ISLAND_DEBUG && result.paths.length) console.log('[ISLAND INTEREST]', JSON.stringify({ articleId: article.id, ...result }));
    }
    afterId = articles.at(-1).id;
  }
  return summary;
}

export default scoreArticlesFromIslandsForUser;
