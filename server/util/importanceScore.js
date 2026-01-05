/**
 * Compute the runtime importance score for an article.
 *
 * Combines time relevance, content quality, redundancy suppression,
 * and source trust into a single ranking signal.
 */
export function computeImportance(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0;

  // Content signal: editorial > promotional, neutral tone preferred
  const quality = article.quality ?? 0;

  // Redundancy suppression: unique articles rank higher
  const uniqueness = article.uniqueness ?? 0;

  // Source reliability (soft boost, never hard filter)
  const feedTrust = article.feed?.feedTrust ?? 0.5;
  const feedTrustBoost = 0.7 + 0.6 * feedTrust;

  // Multiplicative score: weak signals naturally lower importance
  const importance =
    freshness *
    quality *
    uniqueness *
    feedTrustBoost;

  return Math.max(0, importance);
}
