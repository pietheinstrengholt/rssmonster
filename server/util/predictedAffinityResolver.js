/**
 * Predicted Reading Affinity Resolver
 *
 * Predicts how a user is likely to read a NEW / UNREAD article
 * based on historical feed-level attention statistics.
 *
 * This resolver is:
 * - deterministic
 * - explainable
 * - side-effect free
 */

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

/**
 * Resolve predicted reading affinity for a single article
 */
export function resolvePredictedAffinity({ article, feed }) {
  // Safety checks
  if (!article || !feed) {
    return {
      predictedAffinity: 'medium',
      confidence: 0.25,
      source: 'default'
    };
  }

  // Only predict for unread / untouched articles
  if (article.attentionBucket > 0 || article.status !== 'unread') {
    return {
      predictedAffinity: null,
      confidence: 1,
      source: 'measured'
    };
  }

  const {
    feedAttentionAvg = 0,
    feedDeepReadRatio = 0,
    feedSkimRatio = 0,
    feedAttentionSampleSize = 0
  } = feed;

  /* ------------------------------------------------------------
   * Cold start handling
   * ------------------------------------------------------------ */

  // Not enough behavioral data → safe default
  if (feedAttentionSampleSize < 8) {
    return {
      predictedAffinity: 'medium',
      confidence: 0.3,
      source: 'feed'
    };
  }

  /* ------------------------------------------------------------
   * Decision tree (calibrated on real production data)
   *
   * Observations:
   * - feedAttentionAvg usually lives between 0.28–0.38
   * - deepReadRatio > 10–12% is already exceptional
   * - skim-heavy feeds are normal and valuable
   * ------------------------------------------------------------ */

  let predictedAffinity;
  let confidence;

  // Rare but strong signal: deep reading behavior
  if (
    feedDeepReadRatio >= 0.12 &&
    feedAttentionAvg >= 0.35
  ) {
    predictedAffinity = 'deep';
    confidence = clamp(
      0.6 +
      feedDeepReadRatio * 0.8 +
      Math.min(feedAttentionSampleSize / 50, 0.2)
    );
  } else if (feedAttentionAvg >= 0.30) {
    // Normal engaged reading (most good feeds)
    predictedAffinity = 'medium';
    confidence = clamp(
      0.5 +
      (feedAttentionAvg - 0.30) * 1.5 +
      Math.min(feedAttentionSampleSize / 100, 0.15)
    );
  } else if (
    feedAttentionAvg >= 0.18 ||
    feedSkimRatio >= 0.60
  ) {
    // Headline / scanning value
    predictedAffinity = 'skim';
    confidence = clamp(
      0.45 +
      feedAttentionAvg * 0.6 +
      Math.min(feedAttentionSampleSize / 150, 0.1)
    );
  } else {
    // Default: muted / collapsed by default
    predictedAffinity = 'ignore';
    confidence = clamp(
      0.4 +
      Math.min(feedAttentionSampleSize / 200, 0.1)
    );
  }

  return {
    predictedAffinity,
    confidence,
    source: 'feed'
  };
}