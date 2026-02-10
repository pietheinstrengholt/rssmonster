/**
 * Compute the runtime importance score for an article.
 *
 * Combines time relevance, content quality, and coverage signal
 * into a single ranking signal.
 * Note: feedTrust is already included in article.quality (from the Article model virtual field).
 */
export function computeImportance(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0.5;

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0.7;

  // Coverage signal: articles covered by more sources rank higher (inverted uniqueness)
  // More sources reporting the same story = greater importance
  // Formula: coverage = log₂(size + 1) / (1 + log₂(size + 1))
  // This gives: standalone=0.5, 2 sources≈0.61, 4 sources≈0.70, 16 sources≈0.80
  const cluster = article.get('cluster');
  const clusterSize = cluster?.articleCount ?? 1;
  const topicGroupSize = article.topicGroupCount ?? 1;
  const coverageSize = Math.max(clusterSize, topicGroupSize);
  const coverage = Math.log2(coverageSize + 1) / (1 + Math.log2(coverageSize + 1));

  // Weighted sum: balances all signals to produce importance score (0–1)
  // Weights: quality (20%), freshness (50%), coverage (30%)
  // Quality dominates since content is king; freshness ensures recency bias; coverage rewards broad reporting
  const importance = 0.2 * quality + 0.5 * freshness + 0.3 * coverage;

  return Math.max(0, Math.min(1, importance));
}