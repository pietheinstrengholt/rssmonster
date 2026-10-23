import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRecommendedWeights } from '../../config/recommended.js';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Recommended configuration', () => {
  it('defaults to interest and affinity without redistributing the removed weight', () => {
    expect(getRecommendedWeights({})).toEqual({ positiveInterest: 0.6, affinity: 0.1,
      freshness: 0.17, quality: 0, corroboration: 0.1, negativeInterest: 0.3 });
  });

  it.each(['', ' ', 'invalid', '0.1garbage', 'Infinity', '-0.1', '1.1'])(
    'uses documented defaults for invalid coefficients: %j', value => {
      expect(getRecommendedWeights({ RECOMMENDED_INTEREST_WEIGHT: value }).positiveInterest).toBe(0.6);
    }
  );

  it('accepts explicit zeroes and independently configurable bounded weights', () => {
    expect(getRecommendedWeights({ RECOMMENDED_INTEREST_WEIGHT: '0', RECOMMENDED_AFFINITY_WEIGHT: '1',
      RECOMMENDED_FRESHNESS_WEIGHT: '0.4',
      RECOMMENDED_QUALITY_WEIGHT: '0.13', RECOMMENDED_CORROBORATION_WEIGHT: '0.3',
      RECOMMENDED_NEGATIVE_INTEREST_WEIGHT: '0.5' })).toEqual({ positiveInterest: 0, affinity: 1,
      freshness: 0.4, quality: 0.13, corroboration: 0.3, negativeInterest: 0.5 });
  });

  it('restores the previous formula and Quality explanations through environment configuration', async () => {
    vi.stubEnv('RECOMMENDED_AFFINITY_WEIGHT', '0');
    vi.stubEnv('RECOMMENDED_QUALITY_WEIGHT', '0.13');
    vi.resetModules();
    const { computeRecommended, buildRecommendationPresentation } = await import('../../services/recommendations/recommendedScore.js');
    const article = { interestScore: 0.4, semanticAffinityScore: 1,
      freshness: 0.5, qualityScore: 50, toneScore: 50, advertisementScore: 50, Feed: { feedTrust: 0.5 } };
    expect(computeRecommended(article)).toBeCloseTo(0.39, 12);
    expect(computeRecommended({ ...article, interestScore: -0.4 })).toBeCloseTo(0.03, 12);
    expect(buildRecommendationPresentation(article).reasons.map(reason => reason.code))
      .toEqual(['interest_match', 'freshness', 'quality']);
  });
});
