/**
 * Compute the runtime importance score for an article.
 *
 * Combines time relevance, content quality, coverage signal,
 * and source diversity into a single ranking signal.
 * Note: feedTrust is already included in article.quality (from the Article model virtual field).
 */
export function computeImportance(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0.5;

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0.7;

  // Coverage signal: articles in larger clusters rank higher (more redundant reporting)
  // More articles covering the same event/topic = greater importance
  // Formula: coverage = log₂(size + 1) / (1 + log₂(size + 1))
  // This gives: standalone=0.5, 2 articles≈0.61, 4 articles≈0.70, 16 articles≈0.80
  const cluster = article.get('cluster');
  const clusterSize = cluster?.articleCount ?? 1;
  const coverage = Math.log2(clusterSize + 1) / (1 + Math.log2(clusterSize + 1));

  // Source diversity: boosts articles confirmed by multiple unique publishers
  // sourceDiversityScore = log(sourceCount + 1), stored on the cluster
  // Normalized to 0–1 range: log(1+1)=0.69 → ~0.28, log(5+1)=1.79 → ~0.71, log(10+1)=2.40 → ~0.96
  // Cap at log(12+1)≈2.56 to keep the range sensible
  const rawDiversity = cluster?.sourceDiversityScore ?? 0;
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  // Rule-based tag boost: articles matched by user-defined tag rules are more relevant
  const tags = article.Tags ?? [];
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  const ruleBoost = hasRuleTag ? 0.15 : 0;

  // Weighted sum: balances all signals to produce importance score (0–1)
  // Weights: quality (10%), freshness (40%), coverage (25%), sourceDiversity (25%)
  // Plus a flat 0.15 boost for rule-tagged articles
  const importance = 0.1 * quality + 0.40 * freshness + 0.25 * coverage + 0.25 * sourceDiversity + ruleBoost;

  return Math.max(0, Math.min(1, importance));
}