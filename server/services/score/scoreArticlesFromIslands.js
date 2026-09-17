import { articleRecords } from '../articles/articleRecords.js';
import { col, fn, literal, Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { embeddingSimilarity } from '../vectors/embeddingModel.js';
import { DEFAULT_ARTICLE_AFFINITY_THRESHOLD, ISLAND_DEBUG } from '../islands/islandVectorUtils.js';
import { evaluateArticleInterest, loadIslandEvidence, prepareIslandEvidence } from '../islands/islandInterestConfidence.js';

const ARTICLE_BATCH_SIZE = 200;

export function resolveIslandArticleScoreThreshold(value = process.env.ISLAND_ARTICLE_SCORE_THRESHOLD) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= -1 && parsed <= 1 ? parsed : 0.62;
}

// Compatibility helper: direct matching uses the same confidence formula as persisted scoring.
export function strongestIslandScore(articleVector, islands, threshold, embeddingModel = null) {
  const prepared = islands.every(i => i.islandConfidence != null) ? islands : prepareIslandEvidence(islands, []).islands;
  const result = evaluateArticleInterest({ articleVector, embedding_model: embeddingModel }, { islands: prepared, fallbackEvidence: [] }, threshold);
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
  const similarity = (a, b) => embeddingSimilarity(a.articleVector ?? a.islandVector, b.articleVector ?? b.islandVector, a.embedding_model, b.embedding_model, { parseStrings: true, coerceNumbers: true });
  // Feedback can also change support confidence for existing matching Islands.
  const relatedVectors = options.relatedToArticle ? [options.relatedToArticle,
    ...context.islands.filter(island => similarity(options.relatedToArticle, island)
      >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD)
  ] : null;
  const summary = { userId, implicitScoredCount: 0, fallbackScoredCount: 0, behavioralScoredCount: 0, updatedCount: 0, candidatesRescored: 0, interestScoresChanged: 0 };
  Object.assign(summary, { scannedCount: 0, scopeSkippedCount: 0, positiveCount: 0, negativeCount: 0,
    neutralCount: 0, unchangedCount: 0, recordedEvaluationCount: 0, zeroReasons: {}, islandMatches: { zero: 0, one: 0, multiple: 0 },
    scope: createdAtFrom ? 'created_since' : relatedVectors ? 'related_feedback' : 'all_unread',
    createdAtFrom: createdAtFrom || null });
  // One owned aggregate explains rows outside the scan without loading their vectors.
  // These mutually exclusive reasons follow the updater's deterministic eligibility order.
  const eligibilityReason = literal(`CASE
    WHEN filteredInd = 1 THEN 'filtered'
    WHEN duplicateOfArticleId IS NOT NULL THEN 'duplicate'
    WHEN interaction.readState <> 'unread' THEN 'not_unread'
    ${createdAtFrom ? `WHEN articles.createdAt < ${db.sequelize.escape(new Date(createdAtFrom))} THEN 'before_creation_window'` : ''}
    ELSE 'eligible' END`);
  const eligibility = await articleRecords.findAll({ where: { userId }, raw: true,
    attributes: [[eligibilityReason, 'reason'], [fn('COUNT', col('id')), 'count']], group: [eligibilityReason], transaction });
  summary.eligibility = Object.fromEntries(eligibility.map(row => [row.reason, Number(row.count)]));
  let afterId = 0;
  while (true) {
    await options.assertLease?.();
    const batch = await articleRecords.findAll({ where: {
      userId, status: 'unread', ...canonicalArticleWhere(), filteredInd: false, id: { [Op.gt]: afterId },
      ...(createdAtFrom ? { createdAt: { [Op.gte]: createdAtFrom } } : {})
    }, attributes: ['title', 'description', 'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'id', 'articleVector', 'embedding_model', 'interestScore', 'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket'],
    order: [['id', 'ASC']], limit: ARTICLE_BATCH_SIZE, transaction });
    if (!batch.length) break;
    summary.scannedCount += batch.length;
    afterId = batch.at(-1).id;
    const articles = relatedVectors
      ? batch.filter(article => relatedVectors.some(vector => similarity(article, vector) > threshold))
      : batch;
    summary.scopeSkippedCount += batch.length - articles.length;
    const { results } = await explainArticleInterests(userId, articles, { ...options, context });
    const evaluatedAt = new Date();
    const unchangedIds = [];
    for (const article of articles) {
      const result = results.get(String(article.id));
      summary.candidatesRescored++;
      summary[result.score > 0 ? 'positiveCount' : result.score < 0 ? 'negativeCount' : 'neutralCount']++;
      const matches = result.diagnostics.qualifyingIslands;
      summary.islandMatches[matches === 0 ? 'zero' : matches === 1 ? 'one' : 'multiple']++;
      if (result.diagnostics.zeroReason) {
        const reason = result.diagnostics.zeroReason;
        summary.zeroReasons[reason] = (summary.zeroReasons[reason] || 0) + 1;
      }
      const stored = Number(article.interestScore);
      // MySQL FLOAT stores single precision; compare at that exact storage precision.
      const unchanged = stored === result.score || (db.sequelize.getDialect() === 'mysql'
        && Math.fround(stored) === Math.fround(result.score));
      if (!unchanged) {
        const [changed] = await articleRecords.update({ interestScore: result.score, interestScoredAt: evaluatedAt }, {
          where: { id: article.id, userId, status: 'unread', ...canonicalArticleWhere(), filteredInd: false }, transaction
        });
        summary.interestScoresChanged += Number(changed);
        summary.recordedEvaluationCount += Number(changed);
      } else {
        summary.unchangedCount++;
        unchangedIds.push(article.id);
      }
      if (result.score !== 0) {
        summary.updatedCount++;
        if (result.paths.some(p => p.matchType === 'vector-fallback')) summary.fallbackScoredCount++;
        if (result.paths.some(p => p.matchType === 'behavioral-fallback')) summary.behavioralScoredCount++;
        if (result.paths.some(p => p.matchType === 'implicit-behavior')) summary.implicitScoredCount++;
      }
      if (ISLAND_DEBUG && result.paths.length) console.log('[ISLAND INTEREST]', JSON.stringify({ articleId: article.id, ...result }));
    }
    // One metadata write per unchanged batch; never stamp skipped or newly ineligible rows.
    if (unchangedIds.length) {
      const [recorded] = await articleRecords.update({ interestScoredAt: evaluatedAt }, {
        where: { userId, id: unchangedIds, status: 'unread', ...canonicalArticleWhere() }, transaction, silent: true
      });
      summary.recordedEvaluationCount += Number(recorded);
    }
  }
  // Retain updatedCount as a compatibility alias; it has always meant nonzero results.
  summary.nonzeroInterestCount = summary.positiveCount + summary.negativeCount;
  console.log('[INTEREST FUNNEL]', JSON.stringify(summary));
  return summary;
}

export default scoreArticlesFromIslandsForUser;
