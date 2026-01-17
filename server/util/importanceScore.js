/**
 * Compute the runtime importance score for an article.
 *
 * Combines time relevance, content quality, and coverage signal
 * into a single ranking signal.
 * Note: feedTrust is already included in article.quality (from the Article model virtual field).
 */
export function computeImportance(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0;

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0;

  // Coverage signal: articles covered by more sources rank higher (inverted uniqueness)
  // More sources reporting the same story = greater importance
  // Formula: coverage = log₂(clusterSize + 1) / (1 + log₂(clusterSize + 1))
  // This gives: standalone=0.5, 2 sources≈0.61, 4 sources≈0.70, 16 sources≈0.80
  const cluster = article.get('cluster');
  const clusterSize = cluster?.articleCount ?? 1;
  const coverage = Math.log2(clusterSize + 1) / (1 + Math.log2(clusterSize + 1));

  // Multiplicative score: weak signals naturally lower importance
  const importance = freshness * quality * coverage;

  return Math.max(0, importance);
}