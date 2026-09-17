import { islandBehaviorTime, islandExpiresAt, islandReactivationBoundary } from './islandDeadline.js';
import { compatibleEmbeddingModels } from '../vectors/embeddingModel.js';
import { signalTimestamp } from '../articles/articleBehaviorTime.js';
import { buildArticleIslandWeight, computeArticleSignals, qualifyingArticleBehaviorTime } from './islandArticleProfiles.js';
import { deriveIslandConfidence, islandCohesion, prepareIslandEvidence } from './islandInterestConfidence.js';
import { behaviorRecencyWeight, clamp, DEFAULT_ARTICLE_SIGNAL_THRESHOLD,
  SIGNAL_HALF_LIFE_DAYS, SIGNAL_WEIGHTS } from './islandVectorUtils.js';

// Lifecycle confidence measures remaining signed support; it does not change recommendation confidence.
export function summarizeIslandLifecycle(articles, vector, embeddingModel = null, resultingWeight) {
  const evidence = articles.filter(article => compatibleEmbeddingModels(article.embedding_model, embeddingModel))
    .map(article => {
      const signals = computeArticleSignals(article);
      return { article, signals, score: signals.positiveScore - signals.negativeScore };
    }).filter(row => Math.abs(row.score) >= DEFAULT_ARTICLE_SIGNAL_THRESHOLD);
  // Matched profiles already have their resulting weight. Reconstructed support uses
  // the same production aggregation before any signal can advance the activity clock.
  const weight = resultingWeight ?? buildArticleIslandWeight(evidence);
  const preferenceSign = Math.sign(weight);
  let retainedSupport = 0;
  let lastBehaviorAt = null;
  const meaningfulSupport = [];
  for (const { article, signals, score } of evidence) {
    const counts = signals.positiveSignals;
    const raw = {
      lastClickedAt: counts.clicks * SIGNAL_WEIGHTS.click,
      lastMeaningfulReadAt: counts.deepReads * SIGNAL_WEIGHTS.deepRead,
      favoritedAt: counts.stars * SIGNAL_WEIGHTS.star,
      positiveFeedbackAt: counts.positives * SIGNAL_WEIGHTS.positive,
      negativeFeedbackAt: counts.negatives * SIGNAL_WEIGHTS.negative
    };
    const magnitude = Math.abs(score);
    meaningfulSupport.push(article);
    const behaviorAt = qualifyingArticleBehaviorTime(article, signals, preferenceSign)?.getTime();
    if (behaviorAt != null && (lastBehaviorAt == null || behaviorAt > lastBehaviorAt)) lastBehaviorAt = behaviorAt;
    let signalRetention = 0;
    for (const [field, strength] of Object.entries(raw)) {
      const time = signalTimestamp(article, field);
      const recency = behaviorRecencyWeight(time, SIGNAL_HALF_LIFE_DAYS[field]);
      if (strength * recency < DEFAULT_ARTICLE_SIGNAL_THRESHOLD) continue;
      // Normalize each signal independently so aging clicks cannot dilute a surviving favorite.
      signalRetention = Math.max(signalRetention, recency);
    }
    // A strong surviving preference must not be diluted by a large volume of old weak history.
    // Preserve signed cancellation after independent normalization; never hide opposing evidence.
    const totalMagnitude = signals.positiveScore + signals.negativeScore;
    const agreement = totalMagnitude > 0 ? clamp(magnitude / totalMagnitude) : 0;
    retainedSupport = Math.max(retainedSupport, signalRetention * agreement);
  }
  return {
    weight,
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
    { ...summarizeIslandLifecycle(island.seedArticleIds.map(id => byId.get(String(id))), island.islandVector, island.embedding_model),
      sourceArticleIds: island.seedArticleIds }]));
}

export function islandArchiveState(island, support, now = new Date()) {
  const currentTime = Number(now);
  const previousTime = islandBehaviorTime(island?.lastBehaviorAt, currentTime);
  const supportingTime = islandBehaviorTime(support?.lastBehaviorAt, currentTime);
  const supportExpiry = islandExpiresAt(support, currentTime)?.getTime();
  // Expiry is the boundary even when its archival write was delayed. Early capacity
  // archival instead uses the earlier archive time; unchanged evidence cannot cross it.
  const boundary = islandReactivationBoundary(island, currentTime);
  const unknownArchive = island?.archivedInd && boundary == null;
  const canActivate = supportingTime != null && supportExpiry > currentTime
    && !unknownArchive && (boundary == null || supportingTime > boundary);
  return {
    lastBehaviorAt: supportingTime == null
      ? previousTime == null ? null : new Date(previousTime) : new Date(supportingTime),
    archivedInd: !canActivate,
    archivedAt: canActivate ? null : new Date(boundary ?? Math.min(supportExpiry ?? currentTime, currentTime))
  };
}
