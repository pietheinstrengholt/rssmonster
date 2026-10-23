import { Op } from 'sequelize';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import db from '../../models/index.js';
import { unfilteredCanonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { loadIslandEvidence } from '../islands/islandInterestConfidence.js';
import { explainArticleInterests, resolveIslandArticleScoreThreshold } from '../score/scoreArticlesFromIslands.js';
import { computeRecommended, computeRecommendedBreakdown } from './recommendedScore.js';
import { hasEmbeddingModel } from '../vectors/embeddingModel.js';
import { parseVector } from '../vectors/parseVector.js';

const BATCH_SIZE = 200;
const attributes = ['id', 'userId', 'feedId', 'eventId', 'title', 'url', 'description', 'status', 'publishedAt',
  'articleVector', 'embedding_model', 'interestScore', 'semanticAffinityScore', 'interestScoredAt', 'qualityScore', 'toneScore',
  'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd',
  'hotInd', 'positiveInd', 'negativeInd', 'savedInd', 'openedOriginalCount', 'attentionBucket'];

export function resolveRecommendationRunOptions({ userId, status = 'all', limit, mode = 'evaluate', allHistory = false, resume } = {}) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new TypeError('A positive integer userId is required');
  if (!['all', 'unread', 'read'].includes(status)) throw new TypeError('status must be all, unread or read');
  if (!['evaluate', 'recalculate'].includes(mode)) throw new TypeError('mode must be evaluate or recalculate');
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new TypeError('limit must be a positive integer');
  if (typeof allHistory !== 'boolean' || (allHistory && (status !== 'all' || limit !== undefined))) throw new TypeError('allHistory requires status=all without a limit');
  if (resume && (!allHistory || resume.userId !== userId || resume.mode !== mode
    || !Number.isSafeInteger(resume.afterId) || resume.afterId < 0
    || !(resume.upperId === null || Number.isSafeInteger(resume.upperId) && resume.upperId >= resume.afterId)
    || !Number.isFinite(Date.parse(resume.evaluatedAt)) || typeof resume.evidenceHash !== 'string')) throw new TypeError('Invalid all-history checkpoint');
  return { userId, status, limit: allHistory ? null : limit ?? (status === 'unread' ? null : 1000), mode, allHistory, resume };
}

// Historical population must distinguish unsupported vectors from evaluated neutral evidence.
function unsupportedEmbedding(article, interest, context) {
  if (article.articleVector == null || !hasEmbeddingModel(article.embedding_model)) return 'missing_embedding';
  const vector = parseVector(article.articleVector);
  if (!vector?.length || !vector.every(value => Number.isFinite(Number(value)))
    || !vector.some(value => Number(value) !== 0)) return 'invalid_embedding';
  if (!interest.diagnostics.compatibleComparisons && (context.islands.length || context.fallbackEvidence.length || context.implicitEvidence.length)) return 'incompatible_embedding';
  return null;
}

// Uses current memory against older Articles; this is not a historical training replay.
// Stream rows to the caller so all-unread runs do not retain the entire result in memory.
export async function runRecommendationScores(options = {}, onRow = async () => {}, onCheckpoint = async () => {}) {
  const { userId, status, limit, mode, allHistory, resume } = resolveRecommendationRunOptions(options);
  if (!await db.User.findByPk(userId, { attributes: ['id'] })) throw new Error(`User ${userId} does not exist`);
  const now = resume ? Date.parse(resume.evaluatedAt) : Date.now();
  const context = await loadIslandEvidence(userId, { now });
  // A resumed cursor is valid only for the same evidence, algorithm and evaluation clock.
  const evidenceHash = allHistory ? createHash('sha256').update(JSON.stringify({ context,
    threshold: resolveIslandArticleScoreThreshold() })).update(await readFile(new URL('../islands/islandInterestConfidence.js', import.meta.url))).digest('hex') : null;
  if (resume && resume.evidenceHash !== evidenceHash) throw new Error('Checkpoint evidence or evaluator changed; start a new all-history run');
  const islandContext = { ...context, fallbackEvidence: [], implicitEvidence: [] };
  const upperId = resume ? resume.upperId : await db.Article.max('id', { where: { userId } });
  const baseWhere = { userId, ...unfilteredCanonicalArticleWhere(), status: status === 'all' ? { [Op.ne]: 'duplicate' } : status };
  const summary = { mode, userId, status, limit, allHistory, order: allHistory ? 'id ASC' : 'publishedAt DESC, id DESC', evaluatedAt: new Date(now).toISOString(),
    processedCount: 0, evaluatedCount: 0, persistedCount: 0, changedCount: 0, skippedNewerCount: 0,
    skippedUnsupportedCount: 0, skippedEmbeddings: {},
    semanticAffinityScoresChanged: 0, semanticAffinityScores: { positive: 0, zero: 0, null: 0 },
    storedSemanticAffinityScores: { positive: 0, zero: 0, null: 0 },
    positiveCount: 0, negativeCount: 0, neutralCount: 0, zeroReasons: {},
    islands: context.islands.map(island => ({ id: island.id, label: island.label, embeddingModel: island.embedding_model,
      preferenceStrength: island.preferenceStrength, confidence: island.islandConfidence,
      supportCount: island.seedArticleIds.length, contributingArticleCount: 0 })) };
  let cursor = resume ? { id: resume.afterId } : null;
  while (upperId && (limit == null || summary.processedCount < limit)) {
    const processBatch = async transaction => {
      const articles = await db.Article.findAll({
        where: { ...baseWhere, id: { [Op.lte]: upperId, ...(allHistory ? { [Op.gt]: cursor?.id || 0 } : {}) }, ...(!allHistory && cursor ? { [Op.or]: [
          { publishedAt: { [Op.lt]: cursor.publishedAt } },
          { publishedAt: cursor.publishedAt, id: { [Op.lt]: cursor.id } }
        ] } : {}) },
        attributes, order: allHistory ? [['id', 'ASC']] : [['publishedAt', 'DESC'], ['id', 'DESC']],
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
        const storedSemanticAffinityScore = article.semanticAffinityScore == null ? null : Number(article.semanticAffinityScore);
        const semanticAffinityChanged = storedSemanticAffinityScore == null || (db.sequelize.getDialect() === 'mysql'
          ? Math.fround(storedSemanticAffinityScore) !== Math.fround(interest.semanticAffinityScore) : storedSemanticAffinityScore !== interest.semanticAffinityScore);
        const skipReason = allHistory ? unsupportedEmbedding(article, interest, context) : null;
        const storedTime = article.interestScoredAt == null ? null : new Date(article.interestScoredAt).getTime();
        const clockBoundary = db.sequelize.getDialect() === 'mysql' ? Math.floor(now / 1000) * 1000 : now;
        // Full-history runs conservatively preserve ambiguous same-second evaluations too.
        const newer = storedTime != null && (allHistory ? storedTime >= clockBoundary : storedTime > now);
        const writeStatus = skipReason ? `skipped_${skipReason}` : mode === 'evaluate' ? 'not_requested' : newer ? 'skipped_newer_evaluation' : 'persisted';
        if (mode === 'recalculate' && !newer && !skipReason) {
          const key = JSON.stringify([interest.score, interest.semanticAffinityScore]);
          if (!groups.has(key)) groups.set(key, { scores: { interestScore: interest.score, semanticAffinityScore: interest.semanticAffinityScore }, ids: [] });
          groups.get(key).ids.push(article.id);
        }
        const breakdown = computeRecommendedBreakdown({ ...plain, interestScore: interest.score,
          semanticAffinityScore: interest.semanticAffinityScore });
        delete breakdown.event;
        return { id: article.id, title: article.title, url: article.url, status: article.status,
          publishedAt: article.publishedAt, embeddingModel: article.embedding_model,
          storedInterest, interestScore: skipReason ? null : interest.score, changed: !skipReason && changed, writeStatus, skipReason,
          storedSemanticAffinityScore, semanticAffinityScore: skipReason ? null : interest.semanticAffinityScore, semanticAffinityChanged: !skipReason && semanticAffinityChanged,
          islandOnlyInterest: islandResults.get(String(article.id)).score,
          recommendedBefore: computeRecommended(plain), recommended: breakdown.recommended,
          neutralRecommended: computeRecommended({ ...plain, interestScore: 0 }), breakdown,
          supportingIslandIds: context.islands.filter(island => island.seedArticleIds.some(id => String(id) === String(article.id))).map(island => island.id),
          interestDiagnostics: interest };
      });
      // Lock selected targets and commit one batch at a time. Only derived score fields change.
      for (const { scores, ids } of groups.values()) {
        await db.Article.update({ ...scores, interestScoredAt: new Date(now) }, {
          where: { ...baseWhere, id: ids }, transaction, silent: true
        });
      }
      return rows;
    };
    const rows = mode === 'recalculate' ? await db.sequelize.transaction(processBatch) : await processBatch();
    if (!rows.length) break;
    for (const row of rows) {
      summary.processedCount++;
      summary.evaluatedCount += Number(!row.skipReason);
      if (row.skipReason) {
        summary.skippedUnsupportedCount++;
        summary.skippedEmbeddings[row.skipReason] = (summary.skippedEmbeddings[row.skipReason] || 0) + 1;
      }
      summary.changedCount += Number(row.changed);
      summary.semanticAffinityScoresChanged += Number(row.semanticAffinityChanged);
      summary.semanticAffinityScores[row.semanticAffinityScore == null ? 'null' : row.semanticAffinityScore > 0 ? 'positive' : 'zero']++;
      summary.storedSemanticAffinityScores[row.storedSemanticAffinityScore == null ? 'null' : row.storedSemanticAffinityScore > 0 ? 'positive' : 'zero']++;
      summary.persistedCount += Number(row.writeStatus === 'persisted');
      summary.skippedNewerCount += Number(row.writeStatus === 'skipped_newer_evaluation');
      if (!row.skipReason) summary[row.interestScore > 0 ? 'positiveCount' : row.interestScore < 0 ? 'negativeCount' : 'neutralCount']++;
      const reason = row.interestDiagnostics.diagnostics.zeroReason;
      if (reason) summary.zeroReasons[reason] = (summary.zeroReasons[reason] || 0) + 1;
      for (const path of row.interestDiagnostics.paths) {
        const island = summary.islands.find(island => island.id === path.islandId);
        if (island) island.contributingArticleCount++;
      }
      await onRow(row);
    }
    cursor = rows.at(-1);
    if (allHistory) await onCheckpoint({ userId, mode, evaluatedAt: summary.evaluatedAt, upperId, afterId: cursor.id, evidenceHash });
  }
  return { ...summary, finishedAt: new Date().toISOString() };
}
