import { behavioralIntentCompatibility } from './behavioralIntent.js';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { cosineSimilarity } from '../vectors/index.js';
import { DEFAULT_ARTICLE_AFFINITY_THRESHOLD, clamp } from './islandVectorUtils.js';

export const EVIDENCE_LIMIT = 500;
export const EXPLICIT_EVIDENCE_LIMIT = 100;
export const EXPLICIT_WINDOW_DAYS = 90;
const DAY_MS = 86400000;
const similarity = (a, b) => cosineSimilarity(a, b, { parseStrings: true, coerceNumbers: true });
export const isBehavioralEvidence = a => Boolean(a.positiveInd || a.favoriteInd || a.negativeInd || a.clickedAmount > 0 || a.attentionBucket >= 3);

// Membership diagnostics are derived from independent canonical articles, never interaction counters.
export function islandCohesion(members, vector) {
  const unique = [...new Map(members.map(article => [article.id, article])).values()];
  const similarities = unique.map(article => similarity(article.articleVector, vector)).filter(Number.isFinite).sort((a, b) => a - b);
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
    distinctPublicationDays: new Set(unique.map(a => a.publishedAt ? new Date(a.publishedAt).toISOString().slice(0, 10) : null).filter(Boolean)).size,
    medianSimilarity: median, minimumSimilarity: n ? similarities[0] : null,
    positiveEvidenceCount: positive, negativeEvidenceCount: negative, singleton, lowCohesion, classifications
  };
}

export function deriveIslandConfidence(d) {
  if (!d.distinctBehavioralArticles) return 0.1; // Existing preference with unknown support has little authority.
  const support = 0.35 + 0.35 * clamp((d.distinctBehavioralArticles - 1) / 4)
    + 0.15 * clamp((d.distinctSources - 1) / 2) + 0.15 * clamp((d.distinctPublicationDays - 1) / 3);
  const cohesion = (clamp(d.medianSimilarity ?? 0) + clamp(d.minimumSimilarity ?? 0)) / 2;
  const total = d.positiveEvidenceCount + d.negativeEvidenceCount;
  const consistency = total ? 0.5 + 0.5 * Math.max(d.positiveEvidenceCount, d.negativeEvidenceCount) / total : 0.5;
  return clamp(support * cohesion * consistency);
}

// This is a read-time support estimate, not a new Article/Island assignment or a persisted audit.
export function prepareIslandEvidence(islands, evidence, explicitEvidence = evidence) {
  const members = new Map(islands.map(i => [String(i.id), []]));
  for (const article of evidence) {
    const best = islands.map(island => ({ island, similarity: similarity(article.articleVector, island.islandVector) }))
      .filter(row => row.similarity >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity || Number(a.island.id) - Number(b.island.id))[0];
    if (best) members.get(String(best.island.id)).push(article);
  }
  const prepared = islands.map(island => {
    const support = members.get(String(island.id));
    const diagnostics = islandCohesion(support, island.islandVector);
    return { ...island, preferenceStrength: clamp(Number(island.weight || 0), -1, 1),
      islandConfidence: deriveIslandConfidence(diagnostics), diagnostics, seedArticleIds: support.map(a => a.id) };
  });
  const fallbackEvidence = explicitEvidence.filter(article => {
    const sign = article.negativeInd ? -1 : article.positiveInd || article.favoriteInd ? 1 : 0;
    return sign && !prepared.some(island => Math.sign(island.preferenceStrength) === sign
      && similarity(article.articleVector, island.islandVector) >= DEFAULT_ARTICLE_AFFINITY_THRESHOLD);
  });
  return { islands: prepared, fallbackEvidence };
}

// Fixed bounds and user/visibility filters apply before vector comparisons. Publication age is a proxy.
export async function loadIslandEvidence(userId, { transaction, now = Date.now() } = {}) {
  const where = { userId, ...canonicalArticleWhere(), filteredInd: false, articleVector: { [Op.ne]: null } };
  const attributes = ['title', 'description', 'advertisementScore', 'aiAnalysisCompletedAt', 'advertisementScoreActionOverrideInd', 'id', 'feedId', 'publishedAt', 'articleVector', 'positiveInd', 'negativeInd', 'favoriteInd', 'clickedAmount', 'attentionBucket'];
  const query = (extra, limit) => db.Article.findAll({ where: { ...where, ...extra }, attributes,
    order: [['publishedAt', 'DESC'], ['id', 'ASC']], limit, raw: true, transaction });
  const recent = { publishedAt: { [Op.gte]: new Date(now - EXPLICIT_WINDOW_DAYS * DAY_MS), [Op.lte]: new Date(now) } };
  const [islands, evidence, negative, positive] = await Promise.all([
    db.Island.findAll({ where: { userId, archivedInd: false }, attributes: ['id', 'label', 'generatedLabel', 'weight', 'islandVector'], order: [['id', 'ASC']], raw: true, transaction }),
    query({ [Op.or]: [{ positiveInd: 1 }, { favoriteInd: 1 }, { negativeInd: 1 }, { clickedAmount: { [Op.gt]: 0 } }, { attentionBucket: { [Op.gte]: 3 } }] }, EVIDENCE_LIMIT),
    query({ ...recent, negativeInd: 1 }, EXPLICIT_EVIDENCE_LIMIT),
    query({ ...recent, negativeInd: 0, [Op.or]: [{ positiveInd: 1 }, { favoriteInd: 1 }] }, EXPLICIT_EVIDENCE_LIMIT)
  ]);
  return { ...prepareIslandEvidence(islands, evidence, [...negative, ...positive]), now };
}

export function normalizedRelationship(sim, threshold) {
  return Number.isFinite(sim) && sim > threshold && threshold < 1 ? clamp((sim - threshold) / (1 - threshold)) : 0;
}

// One path per Island; strongest positive and strongest negative survive without correlated summation.
export function evaluateArticleInterest(article, context, threshold = 0.62) {
  const paths = [];
  for (const island of context.islands) {
    const sim = similarity(article.articleVector, island.islandVector);
    const direct = normalizedRelationship(sim, threshold);
    const base = { islandId: island.id, preferenceStrength: island.preferenceStrength, islandConfidence: island.islandConfidence,
      singleton: island.diagnostics.singleton, seedSelf: island.seedArticleIds.includes(article.id) };
    const candidates = [];
    if (direct > 0) candidates.push({ ...base, matchType: 'vector-fallback', semanticSimilarity: sim, relationshipConfidence: direct });
    for (const path of candidates) path.contribution = path.preferenceStrength * path.islandConfidence * path.relationshipConfidence;
    candidates.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.matchType.localeCompare(b.matchType));
    if (candidates[0]?.contribution) paths.push(candidates[0]);
  }
  for (const source of context.fallbackEvidence) {
    const age = (context.now - new Date(source.publishedAt).getTime()) / DAY_MS;
    if (!Number.isFinite(age) || age < 0 || age > EXPLICIT_WINDOW_DAYS) continue;
    const sim = similarity(article.articleVector, source.articleVector);
    const relationshipConfidence = normalizedRelationship(sim, threshold);
    if (!relationshipConfidence) continue;
    const recencyFactor = Math.pow(2, -age / 30);
    const sign = source.negativeInd ? -1 : 1;
    const intent = behavioralIntentCompatibility(source, article);
    paths.push({ ...intent, matchType: 'behavioral-fallback', sourceArticleId: source.id, explicitType: sign < 0 ? 'negative' : 'positive',
      semanticSimilarity: sim, relationshipConfidence, recencyFactor, seedSelf: source.id === article.id,
      contribution: sign * 0.25 * recencyFactor * relationshipConfidence * intent.intentCompatibility });
  }
  paths.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
    || String(a.islandId ?? `e${a.sourceArticleId}`).localeCompare(String(b.islandId ?? `e${b.sourceArticleId}`)));
  const positive = paths.find(p => p.contribution > 0);
  const negative = paths.find(p => p.contribution < 0);
  const selectedPaths = [positive, negative].filter(Boolean);
  return { score: Number(clamp((positive?.contribution || 0) + (negative?.contribution || 0), -1, 1).toFixed(4)),
    seedSelf: isBehavioralEvidence(article), paths: selectedPaths };
}
