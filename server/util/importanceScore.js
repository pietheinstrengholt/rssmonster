/**
 * Compute the runtime importance score for an article.
 *
 * Combines time relevance, content quality, coverage signal,
 * and source diversity into a single ranking signal.
 * Note: feedTrust is already included in article.quality (from the Article model virtual field).
 */
export function computeImportance(article) {
  return getImportanceBreakdown(article).importance;
}

export function getImportanceBreakdown(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0.5;

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0.7;

  // Coverage signal: articles in larger clusters rank higher (more corroborated reporting)
  // More articles covering the same event/topic = greater importance.
  // Normalize by log scale so growth stays bounded and robust for very large clusters.
  // This gives: standalone=0.00, 2 articles≈0.17, 4 articles≈0.33, 16 articles≈0.67, 64+ articles=1.00
  const cluster = article.get?.('cluster') ?? article.cluster;
  const rawClusterSize = Number(cluster?.articleCount);
  const clusterSize = Number.isFinite(rawClusterSize) && rawClusterSize > 0 ? rawClusterSize : 1;
  const MAX_COVERAGE_CLUSTER_SIZE = 64;
  const coverage = Math.min(
    Math.log2(clusterSize) / Math.log2(MAX_COVERAGE_CLUSTER_SIZE),
    1
  );

  // Source diversity: boosts articles confirmed by multiple unique publishers
  // sourceDiversityScore = log(sourceCount + 1), stored on the cluster
  // Normalized to 0–1 range: log(1+1)=0.69 → ~0.28, log(5+1)=1.79 → ~0.71, log(10+1)=2.40 → ~0.96
  // Cap at log(12+1)≈2.56 to keep the range sensible
  const rawDiversity = Number(cluster?.sourceDiversityScore ?? 0);
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  // Source spread fallback when only sourceCount is available.
  // This specifically rewards corroboration across multiple distinct publishers.
  const rawSourceCount = Number(cluster?.sourceCount);
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0 ? rawSourceCount : 1;
  const sourceSpread = Math.min(Math.log2(sourceCount) / Math.log2(8), 1);

  // Cross-source corroboration (strong signal): only high when both
  // cluster coverage and publisher diversity are high.
  const crossSource = Math.max(sourceDiversity, sourceSpread);
  const corroboration = coverage * crossSource;

  // Rule-based tag boost: articles matched by user-defined tag rules are more relevant
  const tags = article.Tags ?? article.get?.('Tags') ?? [];
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  const ruleBoost = hasRuleTag ? 0.15 : 0;

  // Personalized relevance: cosine similarity between user interest vector and article vector.
  // Falls back to 0 when user/vector context is unavailable.
  const rawSimilarity = Number(
    article.similarityScore ??
    article.getDataValue?.('similarity') ??
    article.similarity ??
    article.get?.('similarity') ??
    0
  );
  const similarity = Number.isFinite(rawSimilarity)
    ? Math.max(0, Math.min(1, rawSimilarity))
    : 0;

  // Weighted sum: balances all signals to produce importance score (0–1)
  // Weights: similarity (45%), quality (10%), freshness (10%), coverage (20%), crossSource (10%), corroboration (5%)
  // Plus a flat 0.15 boost for rule-tagged articles
  const importance =
    0.45 * similarity +
    0.10 * quality +
    0.10 * freshness +
    0.20 * coverage +
    0.10 * crossSource +
    0.05 * corroboration +
    ruleBoost;

  return {
    similarity,
    quality,
    freshness,
    coverage,
    crossSource,
    corroboration,
    ruleBoost,
    importance: Math.max(0, Math.min(1, importance))
  };
}