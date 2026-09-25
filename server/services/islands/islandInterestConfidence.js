import { activeIslandWhere } from './islandDeadline.js';
import { behavioralIntent, behavioralIntentCompatibility, behavioralIntentTypeCompatibility } from './behavioralIntent.js';
import { Op } from 'sequelize';
import { BEHAVIOR_TIMESTAMP_FIELDS, activeSignal, signalTimestamp, latestBehaviorTimestamp, behaviorTimestampExpression } from '../articles/articleBehaviorTime.js';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { embeddingSimilarity, compatibleEmbeddingModels } from '../vectors/embeddingModel.js';
import { DEFAULT_ARTICLE_AFFINITY_THRESHOLD, clamp } from './islandVectorUtils.js';
import { islandSupportArticleIds, isCurrentIslandSupport } from './islandSupport.js';

export const EVIDENCE_LIMIT = 500;
export const EXPLICIT_EVIDENCE_LIMIT = 100;
export const EXPLICIT_WINDOW_DAYS = 90;
export const IMPLICIT_EVIDENCE_LIMIT = 100;
export const IMPLICIT_WINDOW_DAYS = 7;
const IMPLICIT_HALF_LIFE_DAYS = 3;
const IMPLICIT_SIGNALS = [
  { field: 'lastClickedAt', type: 'click', authority: 0.05 },
  { field: 'lastMeaningfulReadAt', type: 'deep-read', authority: 0.10 }
];
const DAY_MS = 86400000;
const similarity = (a, b, modelA, modelB) => embeddingSimilarity(a, b, modelA, modelB, { parseStrings: true, coerceNumbers: true });
export const isBehavioralEvidence = a => Boolean(a.positiveInd || a.favoriteInd || a.negativeInd || a.clickedAmount > 0 || a.attentionBucket >= 3);

const explicitSign = article => article.negativeInd ? -1 : article.positiveInd || article.favoriteInd ? 1 : 0;
const implicitOnly = article => !explicitSign(article) && (article.clickedAmount > 0 || article.attentionBucket >= 3);
// Implicit recency requires an observed interaction, never publication as a proxy.
const implicitSignalAge = (source, field, now) => source[field] == null ? NaN : (now - new Date(source[field]).getTime()) / DAY_MS;
const recentImplicitTimestamp = (source, now) => Math.max(...IMPLICIT_SIGNALS
  .filter(({ field }) => activeSignal(source, field))
  .map(({ field }) => implicitSignalAge(source, field, now))
  .filter(age => Number.isFinite(age) && age >= 0 && age <= IMPLICIT_WINDOW_DAYS)
  .map(age => now - age * DAY_MS));

// Membership diagnostics are derived from independent canonical articles, never interaction counters.
export function islandCohesion(members, vector, embeddingModel = null) {
  const unique = [...new Map(members.filter(article => compatibleEmbeddingModels(article.embedding_model, embeddingModel)).map(article => [article.id, article])).values()];
  const similarities = unique.map(article => similarity(article.articleVector, vector, article.embedding_model, embeddingModel)).filter(Number.isFinite).sort((a, b) => a - b);
  const n = similarities.length;
  const median = n ? (similarities[Math.floor((n - 1) / 2)] + similarities[Math.floor(n / 2)]) / 2 : null;
  const positive = unique.filter(a => (a.positiveInd && !a.negativeInd) || a.favoriteInd || a.clickedAmount > 0 || a.attentionBucket >= 3).length;
  const negative = unique.filter(a => a.negativeInd).length;
  const singleton = unique.length === 1;
  const lowCohesion = median != null && median < DEFAULT_ARTICLE_AFFINITY_THRESHOLD;
  const classifications = [];
  if (!unique.length) classifications.push('no-current-support');
  if (singleton) classifications.push('singleton');
  if (unique.length < 3) classifications.push('weak-behavioral-support');
  if (lowCohesion) classifications.push('low-cohesion');
  if (positive && negative) classifications.push('mixed-sign-evidence');
  if (unique.length >= 3 && n === unique.length && similarities[0] >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD && !(positive && negative)) classifications.push('strong/coherent');
  return {
    memberCount: members.length, distinctBehavioralArticles: unique.length,
    distinctSources: new Set(unique.map(a => a.feedId).filter(id => id != null)).size,
    distinctInteractionDays: new Set(unique.map(a => latestBehaviorTimestamp(a)?.toISOString().slice(0, 10)).filter(Boolean)).size,
    medianSimilarity: median, minimumSimilarity: n ? similarities[0] : null,
    positiveEvidenceCount: positive, negativeEvidenceCount: negative, singleton, lowCohesion, classifications
  };
}

export function deriveIslandConfidence(d) {
  if (!d.distinctBehavioralArticles) return 0.1; // Existing preference with unknown support has little authority.
  const support = 0.35 + 0.35 * clamp((d.distinctBehavioralArticles - 1) / 4)
    + 0.15 * clamp((d.distinctSources - 1) / 2) + 0.15 * clamp((d.distinctInteractionDays - 1) / 3);
  const cohesion = (clamp(d.medianSimilarity ?? 0) + clamp(d.minimumSimilarity ?? 0)) / 2;
  const total = d.positiveEvidenceCount + d.negativeEvidenceCount;
  const consistency = total ? 0.5 + 0.5 * Math.max(d.positiveEvidenceCount, d.negativeEvidenceCount) / total : 0.5;
  return clamp(support * cohesion * consistency);
}

// Only unanimous negative support establishes intent; positive-only support never supplies it.
const negativeSupportIntent = support => {
  const intents = new Set(support.filter(article => article.negativeInd).map(article => behavioralIntent(article).type));
  return intents.size === 1 ? [...intents][0] : 'unknown';
};

// This is a read-time support estimate, not a new Article/Island assignment or a persisted audit.
export function prepareIslandEvidence(islands, evidence, explicitEvidence = evidence, implicitEvidence = evidence) {
  const members = new Map(islands.map(i => [String(i.id), []]));
  for (const article of evidence) {
    const best = islands.map(island => ({ island, similarity: similarity(article.articleVector, island.islandVector, article.embedding_model, island.embedding_model) }))
      .filter(row => row.similarity >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity || Number(a.island.id) - Number(b.island.id))[0];
    if (best) members.get(String(best.island.id)).push(article);
  }
  const prepared = islands.map(island => {
    const support = members.get(String(island.id));
    const diagnostics = islandCohesion(support, island.islandVector, island.embedding_model);
    const preferenceStrength = clamp(Number(island.weight || 0), -1, 1);
    // A single centroid/weight cannot represent conflicting signed or contextual
    // explicit preferences. Keep their bounded Article-level paths available.
    const explicitPreferenceGroups = new Set(support.filter(explicitSign)
      .map(article => `${explicitSign(article)}:${behavioralIntent(article).type}`));
    return { ...island, preferenceStrength, hasConflictingExplicitPreferences: explicitPreferenceGroups.size > 1,
      ...(preferenceStrength < 0 ? { negativeIntent: negativeSupportIntent(support) } : {}),
      islandConfidence: deriveIslandConfidence(diagnostics), diagnostics, seedArticleIds: support.map(a => a.id) };
  });
  const fallbackEvidence = explicitEvidence.filter(article => {
    const sign = explicitSign(article);
    return sign && !prepared.some(island => !island.hasConflictingExplicitPreferences && Math.sign(island.preferenceStrength) === sign
      && similarity(article.articleVector, island.islandVector, article.embedding_model, island.embedding_model) >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD);
  });
  return { islands: prepared, fallbackEvidence,
    implicitEvidence: [...new Map(implicitEvidence.filter(implicitOnly).map(article => [String(article.id), article])).values()],
    suppressedExplicitEvidenceCount: explicitEvidence.filter(a => a.negativeInd || a.positiveInd || a.favoriteInd).length - fallbackEvidence.length };
}

// Apply interaction windows and stable interaction ordering before the existing evidence bounds.
export async function loadIslandEvidence(userId, { transaction, now = Date.now(), positiveOnly = false } = {}) {
  const where = { userId, ...canonicalArticleWhere(), filteredInd: false, articleVector: { [Op.ne]: null } };
  const attributes = ['title', 'description', 'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'id', 'userId', 'feedId', 'publishedAt', 'articleVector', 'embedding_model', 'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket', ...BEHAVIOR_TIMESTAMP_FIELDS];
  const query = (extra, limit, fields = BEHAVIOR_TIMESTAMP_FIELDS) => db.Article.findAll({ where: { ...where, ...extra }, attributes,
    order: [[behaviorTimestampExpression(db.sequelize, fields, now), 'DESC'], ['id', 'ASC']], limit, raw: true, transaction });
  const recent = field => db.Sequelize.where(behaviorTimestampExpression(db.sequelize, [field], now), {
    [Op.gte]: new Date(now - EXPLICIT_WINDOW_DAYS * DAY_MS), [Op.lte]: new Date(now)
  });
  const implicitQuery = (field, condition) => query({ positiveInd: 0, negativeInd: 0, favoriteInd: 0,
    ...condition, [field]: { [Op.gte]: new Date(now - IMPLICIT_WINDOW_DAYS * DAY_MS), [Op.lte]: new Date(now) }
  }, IMPLICIT_EVIDENCE_LIMIT, [field]);
  const [islands, evidence, negative, positive, clicked, read] = await Promise.all([
    db.Island.findAll({ where: { userId, ...activeIslandWhere(now), mutedInd: false,
      ...(positiveOnly ? { weight: { [Op.gt]: 0 } } : {}) }, attributes: ['id', 'userId', 'label', 'generatedLabel', 'weight', 'islandVector', 'embedding_model', 'supportArticleIds'], order: [['id', 'ASC']], raw: true, transaction }),
    query({ [Op.and]: [db.Sequelize.where(behaviorTimestampExpression(db.sequelize, BEHAVIOR_TIMESTAMP_FIELDS, now), { [Op.ne]: null })],
      [Op.or]: [{ positiveInd: 1 }, { favoriteInd: 1 }, { negativeInd: 1 }, { clickedAmount: { [Op.gt]: 0 } }, { attentionBucket: { [Op.gte]: 3 } }] }, EVIDENCE_LIMIT),
    query({ negativeInd: 1, [Op.and]: [recent('negativeFeedbackAt')] }, EXPLICIT_EVIDENCE_LIMIT, ['negativeFeedbackAt']),
    query({ negativeInd: 0, [Op.or]: [
      { positiveInd: 1, [Op.and]: [recent('positiveFeedbackAt')] },
      { favoriteInd: 1, [Op.and]: [recent('favoritedAt')] }
    ] }, EXPLICIT_EVIDENCE_LIMIT, ['positiveFeedbackAt', 'favoritedAt']),
    implicitQuery('lastClickedAt', { clickedAmount: { [Op.gt]: 0 } }),
    implicitQuery('lastMeaningfulReadAt', { attentionBucket: { [Op.gte]: 3 } })
  ]);
  const supportIslandsByArticleId = new Map();
  for (const island of islands) {
    for (const id of islandSupportArticleIds(island.supportArticleIds)) {
      if (!supportIslandsByArticleId.has(id)) supportIslandsByArticleId.set(id, []);
      supportIslandsByArticleId.get(id).push(island);
    }
  }
  // One owned, bounded read supplements recent evidence; stale IDs never bypass eligibility.
  const retained = supportIslandsByArticleId.size ? await db.Article.findAll({
    where: { ...where, id: [...supportIslandsByArticleId.keys()] }, attributes, raw: true, transaction
  }) : [];
  const support = retained.filter(article => supportIslandsByArticleId.get(String(article.id))
    .some(island => isCurrentIslandSupport(article, island, now)));
  const confidenceEvidence = [...new Map([...evidence, ...support].map(article => [String(article.id), article])).values()];
  // Two bounded reads preserve each signal's clock; deduplicate and apply one
  // combined cap so an Article with both signals occupies only one slot.
  const implicit = [...new Map([...clicked, ...read].map(article => [String(article.id), article])).values()]
    .sort((a, b) => recentImplicitTimestamp(b, now) - recentImplicitTimestamp(a, now) || Number(a.id) - Number(b.id))
    .slice(0, IMPLICIT_EVIDENCE_LIMIT);
  return { ...prepareIslandEvidence(islands, confidenceEvidence, [...negative, ...positive], implicit), now };
}

export function normalizedRelationship(sim, threshold) {
  return Number.isFinite(sim) && sim > threshold && threshold < 1 ? clamp((sim - threshold) / (1 - threshold)) : 0;
}

// Feed affinity uses the same compatible-vector comparison and meaningful direct-match gate.
export function bestPositiveIslandAffinity(article, islands, threshold) {
  let best = null;
  for (const island of islands) {
    if (island.preferenceStrength <= 0) continue;
    const sim = similarity(article.articleVector, island.islandVector, article.embedding_model, island.embedding_model);
    if (!normalizedRelationship(sim, threshold)) continue;
    best = Math.max(best ?? 0, clamp(sim) * clamp(island.islandConfidence));
  }
  return best;
}

// One path per Island; strongest positive and strongest negative survive without correlated summation.
export function evaluateArticleInterest(article, context, threshold = 0.62) {
  const paths = [];
  const implicitEvidence = context.implicitEvidence || [];
  const diagnostics = { threshold, islandsConsidered: context.islands.length,
    fallbackSourcesConsidered: context.fallbackEvidence.length,
    implicitSourcesConsidered: implicitEvidence.length, qualifyingImplicitSignals: 0,
    expiredOrUndatedImplicitSignals: 0,
    suppressedExplicitEvidenceCount: context.suppressedExplicitEvidenceCount || 0,
    compatibleComparisons: 0, qualifyingIslands: 0, qualifyingFallbackSignals: 0,
    expiredOrUndatedFallbackSignals: 0 };
  for (const island of context.islands) {
    const sim = similarity(article.articleVector, island.islandVector, article.embedding_model, island.embedding_model);
    const direct = normalizedRelationship(sim, threshold);
    if (Number.isFinite(sim)) diagnostics.compatibleComparisons++;
    if (direct > 0) diagnostics.qualifyingIslands++;
    const base = { islandId: island.id, preferenceStrength: island.preferenceStrength, islandConfidence: island.islandConfidence,
      singleton: island.diagnostics.singleton, seedSelf: island.seedArticleIds.includes(article.id) };
    const candidates = [];
    if (direct > 0) candidates.push({ ...base, matchType: 'vector-fallback', semanticSimilarity: sim, relationshipConfidence: direct });
    for (const path of candidates) {
      if (path.preferenceStrength < 0) {
        Object.assign(path, behavioralIntentTypeCompatibility(island.negativeIntent ?? 'unknown', behavioralIntent(article).type));
      }
      path.contribution = path.preferenceStrength * path.islandConfidence * path.relationshipConfidence * (path.intentCompatibility ?? 1);
    }
    candidates.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.matchType.localeCompare(b.matchType));
    if (candidates[0]?.contribution) paths.push(candidates[0]);
  }
  for (const source of context.fallbackEvidence) {
    const fields = source.negativeInd ? ['negativeFeedbackAt'] : ['positiveFeedbackAt', 'favoritedAt'];
    for (const field of fields.filter(field => activeSignal(source, field))) {
      const timestamp = signalTimestamp(source, field, context.now);
      const age = timestamp == null ? NaN : (context.now - new Date(timestamp).getTime()) / DAY_MS;
      if (!Number.isFinite(age) || age < 0 || age > EXPLICIT_WINDOW_DAYS) {
        diagnostics.expiredOrUndatedFallbackSignals++;
        continue;
      }
      const sim = similarity(article.articleVector, source.articleVector, article.embedding_model, source.embedding_model);
      if (Number.isFinite(sim)) diagnostics.compatibleComparisons++;
      const relationshipConfidence = normalizedRelationship(sim, threshold);
      if (!relationshipConfidence) continue;
      diagnostics.qualifyingFallbackSignals++;
      const recencyFactor = Math.pow(2, -age / 30);
      const sign = source.negativeInd ? -1 : 1;
      const intent = behavioralIntentCompatibility(source, article);
      paths.push({ ...intent, matchType: 'behavioral-fallback', sourceArticleId: source.id, explicitType: sign < 0 ? 'negative' : 'positive',
        semanticSimilarity: sim, relationshipConfidence, recencyFactor, seedSelf: source.id === article.id,
        contribution: sign * 0.25 * recencyFactor * relationshipConfidence * intent.intentCompatibility });
    }
  }
  for (const source of implicitEvidence) {
    if (!implicitOnly(source)) continue;
    for (const { field, type, authority } of IMPLICIT_SIGNALS) {
      if (!activeSignal(source, field)) continue;
      const age = implicitSignalAge(source, field, context.now);
      if (!Number.isFinite(age) || age < 0 || age > IMPLICIT_WINDOW_DAYS) {
        diagnostics.expiredOrUndatedImplicitSignals++;
        continue;
      }
      const sim = similarity(article.articleVector, source.articleVector, article.embedding_model, source.embedding_model);
      if (Number.isFinite(sim)) diagnostics.compatibleComparisons++;
      const relationshipConfidence = normalizedRelationship(sim, threshold);
      if (!relationshipConfidence) continue;
      diagnostics.qualifyingImplicitSignals++;
      const recencyFactor = Math.pow(2, -age / IMPLICIT_HALF_LIFE_DAYS);
      const intent = behavioralIntentCompatibility(source, article);
      paths.push({ ...intent, matchType: 'implicit-behavior', sourceArticleId: source.id, implicitType: type,
        semanticSimilarity: sim, relationshipConfidence, recencyFactor, seedSelf: source.id === article.id,
        contribution: authority * recencyFactor * relationshipConfidence * intent.intentCompatibility });
    }
  }
  paths.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
    || String(a.islandId ?? `e${a.sourceArticleId}`).localeCompare(String(b.islandId ?? `e${b.sourceArticleId}`)));
  const positive = paths.find(p => p.contribution > 0);
  const negative = paths.find(p => p.contribution < 0);
  const selectedPaths = [positive, negative].filter(Boolean);
  const net = (positive?.contribution || 0) + (negative?.contribution || 0);
  const score = Number(clamp(net, -1, 1).toFixed(4));
  diagnostics.zeroReason = score !== 0 ? null
    : selectedPaths.length ? (net === 0 ? 'signed_cancellation' : 'rounded_to_zero')
    : diagnostics.qualifyingIslands + diagnostics.qualifyingFallbackSignals + diagnostics.qualifyingImplicitSignals > 0 ? 'zero_preference_or_confidence'
    : diagnostics.compatibleComparisons > 0 ? 'below_similarity_threshold'
    : !context.islands.length && !context.fallbackEvidence.length && !implicitEvidence.length ? 'no_eligible_evidence'
    : (diagnostics.expiredOrUndatedFallbackSignals + diagnostics.expiredOrUndatedImplicitSignals) > 0 && !context.islands.length ? 'no_recent_fallback_signal'
    : 'no_compatible_vector';
  return { score, seedSelf: isBehavioralEvidence(article), paths: selectedPaths, diagnostics };
}
