// Computes recommendation ranking scores from article freshness, user interest, quality, event coverage, and source diversity.
// Feed trust is already included in article.quality through the Article model virtual field.

// Defines the recommended weights enforced by this service.
const RECOMMENDED_WEIGHTS = {
  freshness: 0.20,
  interest: 0.22,
  quality: 0.10,
  coverage: 0.22,
  crossSource: 0.13,
  corroboration: 0.13
};

// Defines the max event article count for full coverage enforced by this service.
const MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE = 64;

// Normalizes the interest score.
function normalizeInterestScore(rawInterestScore) {
  // Returns early when raw interest score is not finite.
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
  // Normalizes the interest score before computing recommended.
  const interestScore = normalizeInterestScore(rawInterestScore);

  // Content signal: editorial > promotional, neutral tone preferred
  // (includes feedTrust boost via the Article model's quality virtual field)
  const quality = article.quality ?? 0.7;

  // Coverage signal: articles in larger events rank higher (more corroborated reporting)
  // More articles covering the same event produce a greater recommendation weight.
  // Normalize by log scale so growth stays bounded and robust for very large events.
  // This gives: standalone=0.00, 2 articles≈0.17, 4 articles≈0.33, 16 articles≈0.67, 64+ articles=1.00
  const event = article.get?.('event') ?? article.event;
  // Coerces the raw event article count into the representation required while computing recommended.
  const rawEventArticleCount = Number(event?.articleCount);
  // Selects the event article count based on whether raw event article count is finite and raw event article count exceeds value.
  const eventArticleCount = Number.isFinite(rawEventArticleCount) && rawEventArticleCount > 0 ? rawEventArticleCount : 1;
  // Derives the coverage through min while computing recommended.
  const coverage = Math.min(
    Math.log2(eventArticleCount) / Math.log2(MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE),
    1
  );

  // Source diversity: boosts articles confirmed by multiple unique publishers
  // sourceDiversityScore = log(sourceCount + 1), stored on the event.
  // Normalized to 0–1 range: log(1+1)=0.69 → ~0.28, log(5+1)=1.79 → ~0.71, log(10+1)=2.40 → ~0.96
  // Cap at log(12+1)≈2.56 to keep the range sensible
  const rawDiversity = Number(event?.sourceDiversityScore ?? 0);
  // Derives the source diversity through min while computing recommended.
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  // Source spread fallback when only sourceCount is available.
  // This specifically rewards corroboration across multiple distinct publishers.
  const rawSourceCount = Number(event?.sourceCount);
  // Selects the source count based on whether raw source count is finite and raw source count exceeds value.
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0 ? rawSourceCount : 1;
  // Derives the source spread through min while computing recommended.
  const sourceSpread = Math.min(Math.log2(sourceCount) / Math.log2(8), 1);

  // Cross-source corroboration (strong signal): only high when both
  // event coverage and publisher diversity are high.
  const crossSource = Math.max(sourceDiversity, sourceSpread);
  // Derives the corroboration required while computing recommended.
  const corroboration = coverage * crossSource;

  // Rule-based tag boost: articles matched by user-defined tag rules are more relevant
  const tags = article.Tags ?? article.get?.('Tags') ?? [];
  // Derives the has rule tag through some while computing recommended.
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  // Selects the rule boost based on whether has rule tag is available.
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
  // Derives the freshness required while computing recommended breakdown.
  const freshness = article.freshness ?? 0.5;
  // Coerces the raw interest score into the representation required while computing recommended breakdown.
  const rawInterestScore = Number(article.interestScore ?? 0);
  // Normalizes the interest score before computing recommended breakdown.
  const interestScore = normalizeInterestScore(rawInterestScore);
  // Derives the quality required while computing recommended breakdown.
  const quality = article.quality ?? 0.7;

  // Derives the event required while computing recommended breakdown.
  const event = article.get?.('event') ?? article.event;
  // Coerces the raw event article count into the representation required while computing recommended breakdown.
  const rawEventArticleCount = Number(event?.articleCount);
  // Selects the event article count based on whether raw event article count is finite and raw event article count exceeds value.
  const eventArticleCount = Number.isFinite(rawEventArticleCount) && rawEventArticleCount > 0 ? rawEventArticleCount : 1;
  // Derives the coverage through min while computing recommended breakdown.
  const coverage = Math.min(
    Math.log2(eventArticleCount) / Math.log2(MAX_EVENT_ARTICLE_COUNT_FOR_FULL_COVERAGE),
    1
  );

  // Coerces the raw diversity into the representation required while computing recommended breakdown.
  const rawDiversity = Number(event?.sourceDiversityScore ?? 0);
  // Derives the source diversity through min while computing recommended breakdown.
  const sourceDiversity = Math.min(rawDiversity / 2.56, 1);

  // Coerces the raw source count into the representation required while computing recommended breakdown.
  const rawSourceCount = Number(event?.sourceCount);
  // Selects the source count based on whether raw source count is finite and raw source count exceeds value.
  const sourceCount = Number.isFinite(rawSourceCount) && rawSourceCount > 0 ? rawSourceCount : 1;
  // Derives the source spread through min while computing recommended breakdown.
  const sourceSpread = Math.min(Math.log2(sourceCount) / Math.log2(8), 1);

  // Derives the cross source through max while computing recommended breakdown.
  const crossSource = Math.max(sourceDiversity, sourceSpread);
  // Derives the corroboration required while computing recommended breakdown.
  const corroboration = coverage * crossSource;

  // Derives the tags required while computing recommended breakdown.
  const tags = article.Tags ?? article.get?.('Tags') ?? [];
  // Derives the has rule tag through some while computing recommended breakdown.
  const hasRuleTag = tags.some(t => t.tagType === 'rule');
  // Selects the rule boost based on whether has rule tag is available.
  const ruleBoost = hasRuleTag ? 0.15 : 0;
  // Selects the event boost based on whether event article count reaches 8.
  const eventBoost =
    eventArticleCount >= 8 ? 0.10 :
    eventArticleCount >= 4 ? 0.05 :
    0;

  // Derives the recommended through max while computing recommended breakdown.
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
