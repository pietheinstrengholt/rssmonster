import { isActiveIsland } from './islandDeadline.js';
import { buildArticleIslandWeight, computeArticleSignals } from './islandArticleProfiles.js';
import { prepareIslandEvidence } from './islandInterestConfidence.js';
import { summarizeIslandLifecycle } from './islandLifecycle.js';
import { DEFAULT_ARTICLE_SIGNAL_THRESHOLD } from './islandVectorUtils.js';

export const ISLAND_CAPACITY_ORDER = Object.freeze(['strength', 'confidence', 'lastBehaviorAt', 'id']);

// Use the same weight/confidence semantics for matched profiles and retained unmatched Islands.
// This ordering chooses active storage; it is not another recommendation scoring formula.
export function rankIslandCapacityCandidates(islands, evidence, profilesByIslandId = new Map()) {
  const rows = islands.filter(island => isActiveIsland(island)).map(island => island.get({ plain: true }));
  const byId = new Map(evidence.map(article => [String(article.id), article]));
  const { islands: prepared } = prepareIslandEvidence(rows, evidence, []);
  const ranked = prepared.map(island => {
    const ids = profilesByIslandId.get(island.id)?.articles.map(article => article.articleId) ?? island.seedArticleIds;
    const support = ids.map(id => byId.get(String(id))).filter(Boolean).map(article => {
      const signals = computeArticleSignals(article);
      return { article, score: signals.positiveScore - signals.negativeScore };
    }).filter(row => Math.abs(row.score) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD);
    const lifecycle = summarizeIslandLifecycle(support.map(row => row.article), island.islandVector, island.embedding_model, island.weight);
    return { id: island.id, strength: Math.abs(buildArticleIslandWeight(support)),
      confidence: Number(lifecycle.confidence.toFixed(4)), supportCount: support.length,
      lastBehaviorAt: lifecycle.lastBehaviorAt?.getTime() ?? 0 };
  });
  // Weight already has production four-decimal precision; confidence uses the same precision
  // to avoid floating-point noise deciding capacity. Stable IDs settle otherwise equal evidence.
  return ranked.sort((a, b) => b.strength - a.strength || b.confidence - a.confidence
    || b.lastBehaviorAt - a.lastBehaviorAt || Number(a.id) - Number(b.id));
}
