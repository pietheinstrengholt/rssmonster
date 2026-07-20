// Computes recommendation ranking scores from article freshness, user interest, quality, event coverage, and source diversity.
// Feed trust is already included in article.quality through the Article model virtual field.

const RECOMMENDED_WEIGHTS = {
  freshness: 0.20,
  interest: 0.22,
  quality: 0.10,
  coverage: 0.22,
  crossSource: 0.13,
  corroboration: 0.13
};

const MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE = 64;

function normalizeInterestScore(rawInterestScore) {
  if (!Number.isFinite(rawInterestScore)) return 0;
  // Keep signed interest so negative values apply an explicit ranking penalty.
  return Math.max(-1, Math.min(1, rawInterestScore));
}

// Computes the bounded runtime recommended score for an article.
export function computeRecommended(article) {
  // Time decay: newer articles score higher
  const freshness = article.freshness ?? 0.5;

  // User interest signal: signed affinity stored on the article.
  // Positive values boost ranking; negative values explicitly penalize it.
  const rawInterestScore = Number(article.interestScore ?? 0);
  const interestScore = normalizeInterestScore(rawInterestScore);

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0.7;

  // Coverage signal: articles in larger events rank higher (more corroborated reporting)
  // More articles covering the same event produce a greater recommendation weight.
  // Normalize by log scale so growth stays bounded and robust for very large events.
  // This gives: standalone=0.00, 2 articles≈0.17, 4 articles≈0.33, 16 articles≈0.67, 64+ articles=1.00
  const event = article.get?.('event') ?? article.event;
  const rawEventArticleCount = Number(event?.articleCount);
  const eventArticleCount = Number.isFinite(rawEventArticleCount) && rawEventArticleCount > 0 ? rawEventArticleCount : 1;
  const coverage = Math.min(
    Math.log2(eventArticleCount) / Math.log2(MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE),
    1
  );

  // Source diversity: boosts articles confirmed by multiple unique publishers
  // sourceDiversityScore = log(sourceCount + 1), stored on the event.
  // Normalized to 0–1 range: log(1+1)=0.69 → ~0.28, log(5+1)=1.79 → ~0.71, log(10+1)=2.40 → ~0.96
  // Cap at log(12+1)≈2.56 to keep the range sensible
  const rawDiversity = Number(event?.sourceDiversityScore ?? 0);
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  // Source spread fallback when only sourceCount is available.
  // This specifically rewards corroboration across multiple distinct publishers.
  const rawSourceCount = Number(event?.sourceCount);
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0 ? rawSourceCount : 1;
  const sourceSpread = Math.min(Math.log2(sourceCount) / Math.log2(8), 1);

  // Cross-source corroboration (strong signal): only high when both
  // event coverage and publisher diversity are high.
  const crossSource = Math.max(sourceDiversity, sourceSpread);
  const corroboration = coverage * crossSource;

  // Rule-based tag boost: articles matched by user-defined tag rules are more relevant
  const tags = article.Tags ?? article.get?.('Tags') ?? [];
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  const ruleBoost = hasRuleTag ? 0.15 : 0;

  // Event boost: explicitly rewards meaningful multi-article events.
  const eventBoost =
    eventArticleCount >= 8 ? 0.10 :
    eventArticleCount >= 4 ? 0.05 :
    0;

  // Weighted sum: emphasizes event importance while preserving freshness,
  // personalization, quality, and rule-based relevance.
  const recommended =
    RECOMMENDED_WEIGHTS.freshness * freshness +
    RECOMMENDED_WEIGHTS.interest * interestScore +
    RECOMMENDED_WEIGHTS.quality * quality +
    RECOMMENDED_WEIGHTS.coverage * coverage +
    RECOMMENDED_WEIGHTS.crossSource * crossSource +
    RECOMMENDED_WEIGHTS.corroboration * corroboration +
    eventBoost +
    ruleBoost;

  return Math.max(0, Math.min(1, recommended));
}

// Returns the per-signal breakdown used to explain a recommended score.
export function computeRecommendedBreakdown(article) {
  const freshness = article.freshness ?? 0.5;
  const rawInterestScore = Number(article.interestScore ?? 0);
  const interestScore = normalizeInterestScore(rawInterestScore);
  const quality = article.quality ?? 0.7;

  const event = article.get?.('event') ?? article.event;
  const rawEventArticleCount = Number(event?.articleCount);
  const eventArticleCount = Number.isFinite(rawEventArticleCount) && rawEventArticleCount > 0 ? rawEventArticleCount : 1;
  const coverage = Math.min(
    Math.log2(eventArticleCount) / Math.log2(MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE),
    1
  );

  const rawDiversity = Number(event?.sourceDiversityScore ?? 0);
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  const rawSourceCount = Number(event?.sourceCount);
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0 ? rawSourceCount : 1;
  const sourceSpread = Math.min(Math.log2(sourceCount) / Math.log2(8), 1);

  const crossSource = Math.max(sourceDiversity, sourceSpread);
  const corroboration = coverage * crossSource;

  const tags = article.Tags ?? article.get?.('Tags') ?? [];
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  const ruleBoost = hasRuleTag ? 0.15 : 0;
  const eventBoost =
    eventArticleCount >= 8 ? 0.10 :
    eventArticleCount >= 4 ? 0.05 :
    0;

  const recommended = Math.max(0, Math.min(1,
    RECOMMENDED_WEIGHTS.freshness * freshness +
    RECOMMENDED_WEIGHTS.interest * interestScore +
    RECOMMENDED_WEIGHTS.quality * quality +
    RECOMMENDED_WEIGHTS.coverage * coverage +
    RECOMMENDED_WEIGHTS.crossSource * crossSource +
    RECOMMENDED_WEIGHTS.corroboration * corroboration +
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
    eventArticleCount,
    sourceCount,
    recommended
  };
}
