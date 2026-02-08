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

  // Only predict for unread articles
  if (article.attentionBucket > 0 || article.status !== 'unread') {
    return {
      predictedAffinity: null,
      confidence: 1,
      source: 'measured'
    };
  }

  const {
    feedAttentionAvg,
    feedDeepReadRatio,
    feedAttentionSampleSize
  } = feed;

  // Cold start: not enough behavioral data
  if (!feedAttentionSampleSize || feedAttentionSampleSize < 8) {
    return {
      predictedAffinity: 'medium',
      confidence: 0.3,
      source: 'feed'
    };
  }

  /**
   * Decision tree (ordered by trustworthiness)
   *
   * feedDeepReadRatio answers:
   *   "Do I linger on this feed when I read it?"
   *
   * feedAttentionAvg answers:
   *   "How much do I usually care when I open articles from this feed?"
   */

  let predictedAffinity;
  let confidence;

  if (feedDeepReadRatio >= 0.35) {
    predictedAffinity = 'deep';
    confidence = clamp(0.6 + feedDeepReadRatio * 0.4);
  } else if (feedAttentionAvg >= 0.45) {
    predictedAffinity = 'medium';
    confidence = clamp(0.5 + feedAttentionAvg * 0.5);
  } else if (feedAttentionAvg >= 0.2) {
    predictedAffinity = 'skim';
    confidence = clamp(0.4 + feedAttentionAvg * 0.5);
  } else {
    predictedAffinity = 'ignore';
    confidence = clamp(0.4 + (0.2 - feedAttentionAvg));
  }

  return {
    predictedAffinity,
    confidence,
    source: 'feed'
  };
}