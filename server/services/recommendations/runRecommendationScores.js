import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { loadIslandEvidence } from '../islands/islandInterestConfidence.js';
import { explainArticleInterests } from '../score/scoreArticlesFromIslands.js';
import { computeRecommended, computeRecommendedBreakdown } from './recommendedScore.js';

const BATCH_SIZE = 200;
const attributes = ['id', 'userId', 'feedId', 'eventId', 'title', 'url', 'description', 'status', 'publishedAt',
  'articleVector', 'embedding_model', 'interestScore', 'interestScoredAt', 'qualityScore', 'sentimentScore',
  'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd',
  'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket'];

export function resolveRecommendationRunOptions({ userId, status = 'all', limit, mode = 'evaluate' } = {}) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new TypeError('A positive integer userId is required');
  if (!['all', 'unread', 'read'].includes(status)) throw new TypeError('status must be all, unread or read');
  if (!['evaluate', 'recalculate'].includes(mode)) throw new TypeError('mode must be evaluate or recalculate');
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new TypeError('limit must be a positive integer');
  return { userId, status, limit: limit ?? (status === 'unread' ? null : 1000), mode };
}

// Uses current memory against older Articles; this is not a historical training replay.
// Stream rows to the caller so all-unread runs do not retain the entire result in memory.
export async function runRecommendationScores(options = {}, onRow = async () => {}) {
  const { userId, status, limit, mode } = resolveRecommendationRunOptions(options);
  if (!await db.User.findByPk(userId, { attributes: ['id'] })) throw new Error(`User ${userId} does not exist`);
  const now = Date.now();
  const context = await loadIslandEvidence(userId, { now });
  const islandContext = { ...context, fallbackEvidence: [], implicitEvidence: [] };
  const upperId = await db.Article.max('id', { where: { userId } });
  const baseWhere = { userId, ...canonicalArticleWhere(), status: status === 'all' ? { [Op.ne]: 'duplicate' } : status };
  const summary = { mode, userId, status, limit, order: 'publishedAt DESC, id DESC', evaluatedAt: new Date(now).toISOString(),
    processedCount: 0, persistedCount: 0, changedCount: 0, skippedNewerCount: 0,
    positiveCount: 0, negativeCount: 0, neutralCount: 0, zeroReasons: {},
    islands: context.islands.map(island => ({ id: island.id, label: island.label, embeddingModel: island.embedding_model,
      preferenceStrength: island.preferenceStrength, confidence: island.islandConfidence,
      supportCount: island.seedArticleIds.length, contributingArticleCount: 0 })) };
  let cursor;
  while (upperId && (limit == null || summary.processedCount < limit)) {
    const processBatch = async transaction => {
      const articles = await db.Article.findAll({
        where: { ...baseWhere, id: { [Op.lte]: upperId }, ...(cursor ? { [Op.or]: [
          { publishedAt: { [Op.lt]: cursor.publishedAt } },
          { publishedAt: cursor.publishedAt, id: { [Op.lt]: cursor.id } }
        ] } : {}) },
        attributes, order: [['publishedAt', 'DESC'], ['id', 'DESC']],
        limit: Math.min(BATCH_SIZE, limit == null ? BATCH_SIZE : limit - summary.processedCount),
        include: [
          { model: db.Event, as: 'event', attributes: ['id', 'articleCount', 'sourceCount'], where: { userId }, required: false },
          { model: db.Feed, attributes: ['id', 'feedTrust'], where: { userId }, required: false },
          { model: db.Tag, attributes: ['id', 'articleId', 'tagType'], where: { userId }, required: false, separate: true }
        ], transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
      });
      if (!articles.length) return [];
      const { results } = await explainArticleInterests(userId, articles, { context });
      const { results: islandResults } = await explainArticleInterests(userId, articles, { context: islandContext });
      const groups = new Map();
      const rows = articles.map(article => {
        const interest = results.get(String(article.id));
        // Explicit attribute projections omit virtuals from get({ plain: true }).
        const plain = { ...article.get({ plain: true }), freshness: article.freshness };
        const storedInterest = Number(article.interestScore || 0);
        const changed = db.sequelize.getDialect() === 'mysql'
          ? Math.fround(storedInterest) !== Math.fround(interest.score) : storedInterest !== interest.score;
        const newer = article.interestScoredAt && new Date(article.interestScoredAt).getTime() > now;
        const writeStatus = mode === 'evaluate' ? 'not_requested' : newer ? 'skipped_newer_evaluation' : 'persisted';
        if (mode === 'recalculate' && !newer) {
          if (!groups.has(interest.score)) groups.set(interest.score, []);
          groups.get(interest.score).push(article.id);
        }
        const breakdown = computeRecommendedBreakdown({ ...plain, interestScore: interest.score });
        delete breakdown.event;
        return { id: article.id, title: article.title, url: article.url, status: article.status,
          publishedAt: article.publishedAt, embeddingModel: article.embedding_model,
          storedInterest, interestScore: interest.score, changed, writeStatus,
          islandOnlyInterest: islandResults.get(String(article.id)).score,
          recommendedBefore: computeRecommended(plain), recommended: breakdown.recommended,
          neutralRecommended: computeRecommended({ ...plain, interestScore: 0 }), breakdown,
          supportingIslandIds: context.islands.filter(island => island.seedArticleIds.some(id => String(id) === String(article.id))).map(island => island.id),
          interestDiagnostics: interest };
      });
      // Lock selected targets and commit one batch at a time. Only derived score fields change.
      for (const [interestScore, ids] of groups) {
        await db.Article.update({ interestScore, interestScoredAt: new Date(now) }, {
          where: { ...baseWhere, id: ids }, transaction, silent: true
        });
      }
      return rows;
    };
    const rows = mode === 'recalculate' ? await db.sequelize.transaction(processBatch) : await processBatch();
    if (!rows.length) break;
    for (const row of rows) {
      summary.processedCount++;
      summary.changedCount += Number(row.changed);
      summary.persistedCount += Number(row.writeStatus === 'persisted');
      summary.skippedNewerCount += Number(row.writeStatus === 'skipped_newer_evaluation');
      summary[row.interestScore > 0 ? 'positiveCount' : row.interestScore < 0 ? 'negativeCount' : 'neutralCount']++;
      const reason = row.interestDiagnostics.diagnostics.zeroReason;
      if (reason) summary.zeroReasons[reason] = (summary.zeroReasons[reason] || 0) + 1;
      for (const path of row.interestDiagnostics.paths) {
        const island = summary.islands.find(island => island.id === path.islandId);
        if (island) island.contributingArticleCount++;
      }
      await onRow(row);
    }
    cursor = rows.at(-1);
  }
  return { ...summary, finishedAt: new Date().toISOString() };
}
