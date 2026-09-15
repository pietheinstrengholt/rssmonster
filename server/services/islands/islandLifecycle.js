import { compatibleEmbeddingModels } from '../vectors/embeddingModel.js';
import { signalTimestamp } from '../articles/articleBehaviorTime.js';
import { computeArticleSignals } from './islandArticleProfiles.js';
import { deriveIslandConfidence, islandCohesion, prepareIslandEvidence } from './islandInterestConfidence.js';
import { behaviorRecencyWeight, clamp, DEFAULT_ARTICLE_SIGNAL_THRESHOLD,
  DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD, isStaleIsland, SIGNAL_HALF_LIFE_DAYS, SIGNAL_WEIGHTS } from './islandVectorUtils.js';

// Lifecycle confidence measures remaining signed support; it does not change recommendation confidence.
export function summarizeIslandLifecycle(articles, vector, embeddingModel = null) {
  let retainedSupport = 0;
  let lastBehaviorAt = null;
  const meaningfulSupport = [];
  for (const article of articles) {
    if (!compatibleEmbeddingModels(article.embedding_model, embeddingModel)) continue;
    const signals = computeArticleSignals(article);
    const counts = signals.positiveSignals;
    const raw = {
      lastClickedAt: counts.clicks * SIGNAL_WEIGHTS.click,
      lastMeaningfulReadAt: counts.deepReads * SIGNAL_WEIGHTS.deepRead,
      favoritedAt: counts.stars * SIGNAL_WEIGHTS.star,
      positiveFeedbackAt: counts.positives * SIGNAL_WEIGHTS.positive,
      negativeFeedbackAt: counts.negatives * SIGNAL_WEIGHTS.negative
    };
    const magnitude = Math.abs(signals.positiveScore - signals.negativeScore);
    if (magnitude < DEFAULT_ARTICLE_SIGNAL_THRESHOLD) continue;
    meaningfulSupport.push(article);
    let signalRetention = 0;
    for (const [field, strength] of Object.entries(raw)) {
      const time = signalTimestamp(article, field);
      const recency = behaviorRecencyWeight(time, SIGNAL_HALF_LIFE_DAYS[field]);
      if (strength * recency < DEFAULT_ARTICLE_SIGNAL_THRESHOLD) continue;
      // Normalize each signal independently so aging clicks cannot dilute a surviving favorite.
      signalRetention = Math.max(signalRetention, recency);
      if (time == null) continue;
      const timestamp = new Date(time).getTime();
      if (Number.isFinite(timestamp) && timestamp <= Date.now() && (lastBehaviorAt == null || timestamp > lastBehaviorAt)) lastBehaviorAt = timestamp;
    }
    // A strong surviving preference must not be diluted by a large volume of old weak history.
    // Preserve signed cancellation after independent normalization; never hide opposing evidence.
    const totalMagnitude = signals.positiveScore + signals.negativeScore;
    const agreement = totalMagnitude > 0 ? clamp(magnitude / totalMagnitude) : 0;
    retainedSupport = Math.max(retainedSupport, signalRetention * agreement);
  }
  return {
    lastBehaviorAt: lastBehaviorAt == null ? null : new Date(lastBehaviorAt),
    retainedSupport,
    confidence: deriveIslandConfidence(islandCohesion(meaningfulSupport, vector, embeddingModel)) * retainedSupport
  };
}

// Unmatched active Islands reuse the existing nearest-support rule among active neighbors.
export function reconstructIslandLifecycles(islands, articles) {
  const byId = new Map(articles.map(article => [String(article.id), article]));
  const rows = islands.map(island => typeof island.get === 'function' ? island.get({ plain: true }) : island);
  const { islands: prepared } = prepareIslandEvidence(rows, articles, []);
  return new Map(prepared.map(island => [island.id,
    summarizeIslandLifecycle(island.seedArticleIds.map(id => byId.get(String(id))), island.islandVector, island.embedding_model)]));
}

export function islandArchiveState(island, support, now = new Date()) {
  const weak = support.confidence < DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD;
  const stale = isStaleIsland(support);
  if (island?.archivedInd) {
    const archivedAt = island.archivedAt == null ? NaN : new Date(island.archivedAt).getTime();
    const newerBehavior = support.lastBehaviorAt != null && (Number.isFinite(archivedAt)
      ? support.lastBehaviorAt.getTime() > archivedAt : !stale);
    if (!weak && newerBehavior) return { archivedInd: false, archivedAt: null };
    return { archivedInd: true, archivedAt: island.archivedAt ?? now };
  }
  return { archivedInd: weak && stale, archivedAt: weak && stale ? now : null };
}
