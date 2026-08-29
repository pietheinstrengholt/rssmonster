// Computes personalized recommendation scores from interest, freshness, Quality, and corroboration.
import { computeQuality } from '../articles/articleQuality.js';
import { clamp01, computeEventRankingMetrics } from './eventRankingMetrics.js';

const RECOMMENDED_WEIGHTS = Object.freeze({
  positiveInterest: 0.45,
  freshness: 0.25,
  quality: 0.20,
  corroboration: 0.10,
  negativeInterest: 0.30
});
const RULE_TAG_BOOST = 0.08;

// Preserves the signed Interest Island range so negative affinity remains a penalty.
const normalizeInterestScore = rawInterestScore => {
  const numeric = Number(rawInterestScore);
  return Number.isFinite(numeric) ? Math.max(-1, Math.min(1, numeric)) : 0;
};

// Returns whether any user rule matched without allowing multiple rule tags to stack.
const hasMatchingRuleTag = article => {
  const tags = article?.get?.('Tags') ?? article?.get?.('tags') ?? article?.Tags ?? article?.tags ?? [];
  return tags.some(tag => tag.tagType === 'rule');
};

// Computes the signals and final bounded score used by personalized Recommended ranking.
export function computeRecommendedBreakdown(article) {
  const interestScore = normalizeInterestScore(article?.interestScore ?? 0);
  const positiveInterest = Math.max(interestScore, 0);
  const negativeInterest = Math.max(-interestScore, 0);
  const freshness = clamp01(article?.freshness ?? 0.5);
  const quality = computeQuality(article);
  const eventMetrics = computeEventRankingMetrics(article);
  const ruleBoost = hasMatchingRuleTag(article) ? RULE_TAG_BOOST : 0;
  const recommended = clamp01(
    RECOMMENDED_WEIGHTS.positiveInterest * positiveInterest +
    RECOMMENDED_WEIGHTS.freshness * freshness +
    RECOMMENDED_WEIGHTS.quality * quality +
    RECOMMENDED_WEIGHTS.corroboration * eventMetrics.corroboration -
    RECOMMENDED_WEIGHTS.negativeInterest * negativeInterest +
    ruleBoost
  );

  return {
    interestScore,
    positiveInterest,
    negativeInterest,
    freshness,
    quality,
    ...eventMetrics,
    ruleBoost,
    recommended
  };
}

// Computes the bounded runtime Recommended score for an article.
export function computeRecommended(article) {
  return computeRecommendedBreakdown(article).recommended;
}

// Rounds recommendation values for a stable public API contract.
const serializeRecommendationValue = value => Number(Number(value || 0).toFixed(4));

// Converts the personalized score breakdown into frontend-ready promotion reasons.
export function buildRecommendationPresentation(article, { interestIsland = null } = {}) {
  const breakdown = computeRecommendedBreakdown(article);
  const tags = article?.get?.('Tags') ?? article?.get?.('tags') ?? article?.Tags ?? article?.tags ?? [];
  const reasons = [];

  if (breakdown.positiveInterest > 0) {
    reasons.push({
      code: 'interest_match',
      value: serializeRecommendationValue(breakdown.positiveInterest),
      contribution: serializeRecommendationValue(
        RECOMMENDED_WEIGHTS.positiveInterest * breakdown.positiveInterest
      ),
      ...(interestIsland ? { island: interestIsland } : {})
    });
  }

  if (breakdown.corroboration > 0) {
    reasons.push({
      code: 'source_diversity',
      value: serializeRecommendationValue(breakdown.corroboration),
      contribution: serializeRecommendationValue(
        RECOMMENDED_WEIGHTS.corroboration * breakdown.corroboration
      ),
      sourceCount: breakdown.sourceCount,
      ...(breakdown.event ? {
        event: {
          id: breakdown.event.id,
          name: breakdown.event.name || null,
          generatedName: breakdown.event.generatedName || null
        }
      } : {})
    });
  }

  if (breakdown.ruleBoost > 0) {
    reasons.push({
      code: 'rule_match',
      value: 1,
      contribution: serializeRecommendationValue(breakdown.ruleBoost),
      tags: tags
        .filter(tag => tag.tagType === 'rule')
        .map(tag => ({ id: tag.id, name: tag.name }))
    });
  }

  if (breakdown.freshness > 0) {
    reasons.push({
      code: 'freshness',
      value: serializeRecommendationValue(breakdown.freshness),
      contribution: serializeRecommendationValue(
        RECOMMENDED_WEIGHTS.freshness * breakdown.freshness
      )
    });
  }

  if (breakdown.quality > 0) {
    reasons.push({
      code: 'quality',
      value: serializeRecommendationValue(breakdown.quality),
      contribution: serializeRecommendationValue(RECOMMENDED_WEIGHTS.quality * breakdown.quality)
    });
  }

  return {
    score: serializeRecommendationValue(breakdown.recommended),
    reasons
  };
}
