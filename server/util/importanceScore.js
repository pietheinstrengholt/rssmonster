/**
 * Compute the runtime importance score for an article.
 *
 * Combines time relevance, content quality, and redundancy suppression
 * into a single ranking signal.
 * Note: feedTrust is already included in article.quality (from the Article model virtual field).
 */
export function computeImportance(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0;

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0;

  // Redundancy suppression: unique articles rank higher
  const uniqueness = article.uniqueness ?? 0;

  // Multiplicative score: weak signals naturally lower importance
  const importance =
    freshness *
    quality *
    uniqueness;

  return Math.max(0, importance);
}
