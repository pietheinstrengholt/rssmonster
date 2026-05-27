/**
 * Compute the runtime recommended score for an article.
 *
 * Combines time relevance, user interest, content quality, coverage signal,
 * and source diversity into a single ranking signal.
 * Note: feedTrust is already included in article.quality (from the Article model virtual field).
 */
export function computeRecommended(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0.5;

  // User interest signal: island/topic affinity stored on the article.
  // Stored values can be negative, neutral, or positive; normalize -1..1 into 0..1.
  const rawInterestScore = Number(article.interestScore ?? 0);
  const interestScore = Number.isFinite(rawInterestScore)
    ? Math.max(0, Math.min(1, (rawInterestScore + 1) / 2))
    : 0.5;

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0.7;

  // Coverage signal: articles in larger clusters rank higher (more corroborated reporting)
  // More articles covering the same event/topic = greater recommended weight.
  // Normalize by log scale so growth stays bounded and robust for very large clusters.
  // This gives: standalone=0.00, 2 articles≈0.17, 4 articles≈0.33, 16 articles≈0.67, 64+ articles=1.00
  const cluster =
    article.get?.('event') ??
    article.event ??
    article.get?.('cluster') ??
    article.cluster;
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

  // Event boost: explicitly rewards meaningful multi-article events.
  const eventBoost =
    clusterSize >= 8 ? 0.10 :
    clusterSize >= 4 ? 0.05 :
    0;

  // Weighted sum: emphasizes event importance while preserving freshness,
  // personalization, quality, and rule-based relevance.
  const recommended =
    0.22 * freshness +
    0.12 * interestScore +
    0.12 * quality +
    0.24 * coverage +
    0.15 * crossSource +
    0.15 * corroboration +
    eventBoost +
    ruleBoost;

  return Math.max(0, Math.min(1, recommended));
}

/**
 * Return the per-signal breakdown used by computeRecommended.
 * Useful for debug logging to trace why an article ranked where it did.
 */
export function computeRecommendedBreakdown(article) {
  const freshness = article.freshness ?? 0.5;
  const rawInterestScore = Number(article.interestScore ?? 0);
  const interestScore = Number.isFinite(rawInterestScore)
    ? Math.max(0, Math.min(1, (rawInterestScore + 1) / 2))
    : 0.5;
  const quality = article.quality ?? 0.7;

  const cluster =
    article.get?.('event') ??
    article.event ??
    article.get?.('cluster') ??
    article.cluster;
  const rawClusterSize = Number(cluster?.articleCount);
  const clusterSize = Number.isFinite(rawClusterSize) && rawClusterSize > 0 ? rawClusterSize : 1;
  const MAX_COVERAGE_CLUSTER_SIZE = 64;
  const coverage = Math.min(
    Math.log2(clusterSize) / Math.log2(MAX_COVERAGE_CLUSTER_SIZE),
    1
  );

  const rawDiversity = Number(cluster?.sourceDiversityScore ?? 0);
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  const rawSourceCount = Number(cluster?.sourceCount);
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0 ? rawSourceCount : 1;
  const sourceSpread = Math.min(Math.log2(sourceCount) / Math.log2(8), 1);

  const crossSource = Math.max(sourceDiversity, sourceSpread);
  const corroboration = coverage * crossSource;

  const tags = article.Tags ?? article.get?.('Tags') ?? [];
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  const ruleBoost = hasRuleTag ? 0.15 : 0;
  const eventBoost =
    clusterSize >= 8 ? 0.10 :
    clusterSize >= 4 ? 0.05 :
    0;

  const recommended = Math.max(0, Math.min(1,
    0.20 * freshness +
    0.22 * interestScore +
    0.10 * quality +
    0.22 * coverage +
    0.13 * crossSource +
    0.13 * corroboration +
    eventBoost +
    ruleBoost
  ));

  return {
    freshness,
    interestScore,
    quality,
    coverage,
    crossSource,
    corroboration,
    eventBoost,
    ruleBoost,
    clusterSize,
    sourceCount,
    recommended
  };
}
