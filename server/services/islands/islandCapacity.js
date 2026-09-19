import { isActiveIsland } from './islandDeadline.js';
import { buildArticleIslandWeight, computeArticleSignals } from './islandArticleProfiles.js';
import { prepareIslandEvidence } from './islandInterestConfidence.js';
import { summarizeIslandLifecycle } from './islandLifecycle.js';
import { DEFAULT_ARTICLE_SIGNAL_THRESHOLD, ISLAND_REPLACEMENT_MARGIN, ISLAND_SIGNAL_NORMALIZATION } from './islandVectorUtils.js';

export const ISLAND_CAPACITY_ORDER = Object.freeze(['selectionStrength', 'incumbent', 'strength', 'confidence', 'lastBehaviorAt', 'id']);

// Collective evidence chooses storage, not recommendation weights. Canonical Articles
// count once; signed cancellation, existing decay and cohesion still limit authority.
export function summarizeIslandSelection(articles, vector, embeddingModel, weight) {
  const support = [...new Map(articles.map(article => [String(article.id), article])).values()].map(article => {
    const signals = computeArticleSignals(article);
    return { article, score: signals.positiveScore - signals.negativeScore };
  }).filter(row => Math.abs(row.score) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD);
  const lifecycle = summarizeIslandLifecycle(support.map(row => row.article), vector, embeddingModel, weight);
  const signedEvidence = support.reduce((sum, row) => sum + row.score, 0);
  const explicitSupportCount = support.filter(({ article }) => {
    const signals = computeArticleSignals({ positiveInd: article.positiveInd, negativeInd: article.negativeInd,
      favoriteInd: article.favoriteInd, publishedAt: article.publishedAt, favoritedAt: article.favoritedAt,
      positiveFeedbackAt: article.positiveFeedbackAt, negativeFeedbackAt: article.negativeFeedbackAt });
    return Math.abs(signals.positiveScore - signals.negativeScore) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD;
  }).length;
  return {
    collectiveStrength: Number((Math.min(1, Math.abs(signedEvidence) / ISLAND_SIGNAL_NORMALIZATION) * lifecycle.confidence).toFixed(4)),
    strength: Math.abs(buildArticleIslandWeight(support)), confidence: Number(lifecycle.confidence.toFixed(4)),
    supportCount: support.length, explicitSupportCount, lastBehaviorAt: lifecycle.lastBehaviorAt?.getTime() ?? 0
  };
}

// Use the same weight/confidence semantics for matched profiles and retained unmatched Islands.
// This ordering chooses active storage; it is not another recommendation scoring formula.
export function rankIslandCapacityCandidates(islands, evidence, profilesByIslandId = new Map(),
  incumbentIds = new Set(islands.filter(island => isActiveIsland(island)).map(island => island.id))) {
  const rows = islands.filter(island => isActiveIsland(island)).map(island => island.get({ plain: true }));
  const byId = new Map(evidence.map(article => [String(article.id), article]));
  const { islands: prepared } = prepareIslandEvidence(rows, evidence, []);
  const ranked = prepared.map(island => {
    const ids = profilesByIslandId.get(island.id)?.articles.map(article => article.articleId) ?? island.seedArticleIds;
    const support = ids.map(id => byId.get(String(id))).filter(Boolean);
    const selection = summarizeIslandSelection(support, island.islandVector, island.embedding_model, island.weight);
    const incumbent = incumbentIds.has(island.id);
    // A lone implicit interaction can fill a vacancy, but cannot evict supported memory.
    const loneImplicitChallenger = !incumbent && incumbentIds.size > 0
      && selection.supportCount < 2 && selection.explicitSupportCount === 0;
    const selectionStrength = loneImplicitChallenger ? 0 : Number((selection.collectiveStrength
      * (incumbent ? 1 + ISLAND_REPLACEMENT_MARGIN : 1)).toFixed(4));
    return { id: island.id, ...selection, incumbent, selectionStrength };
  });
  // Weight already has production four-decimal precision; confidence uses the same precision
  // to avoid floating-point noise deciding capacity. Stable IDs settle otherwise equal evidence.
  return ranked.sort((a, b) => b.selectionStrength - a.selectionStrength || Number(b.incumbent) - Number(a.incumbent)
    || b.strength - a.strength || b.confidence - a.confidence
    || b.lastBehaviorAt - a.lastBehaviorAt || Number(a.id) - Number(b.id));
}
