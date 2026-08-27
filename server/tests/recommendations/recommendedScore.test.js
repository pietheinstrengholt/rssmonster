import { describe, expect, it } from 'vitest';
import {
  buildRecommendationPresentation,
  computeRecommended,
  computeRecommendedBreakdown
} from '../../services/recommendations/recommendedScore.js';

describe('computeRecommended', () => {
  it('ranks larger corroborated events higher with equal freshness/quality', () => {
    const standalone = {
      freshness: 0.5,
      quality: 0.7,
      get: key => {
        if (key === 'event') return { articleCount: 1, sourceDiversityScore: 0 };
        if (key === 'Tags') return [];
        return undefined;
      }
    };

    const highlyCorroborated = {
      freshness: 0.5,
      quality: 0.7,
      get: key => {
        if (key === 'event') return { articleCount: 32, sourceDiversityScore: 2.0 };
        if (key === 'Tags') return [];
        return undefined;
      }
    };

    expect(computeRecommended(highlyCorroborated)).toBeGreaterThan(computeRecommended(standalone));
  });

  it('reads event associations from plain object properties when get() is not present', () => {
    const article = {
      freshness: 0.6,
      quality: 0.7,
      event: { articleCount: 20, sourceDiversityScore: 1.8 },
      Tags: []
    };

    const score = computeRecommended(article);

    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('strongly prioritizes same-size events when corroborated by more sources', () => {
    const sameSizeSingleSource = {
      freshness: 0.5,
      quality: 0.7,
      event: {
        articleCount: 24,
        sourceCount: 1,
        sourceDiversityScore: 0
      },
      Tags: []
    };

    const sameSizeMultiSource = {
      freshness: 0.5,
      quality: 0.7,
      event: {
        articleCount: 24,
        sourceCount: 8,
        sourceDiversityScore: 2.4
      },
      Tags: []
    };

    const singleSourceScore = computeRecommended(sameSizeSingleSource);
    const multiSourceScore = computeRecommended(sameSizeMultiSource);

    expect(multiSourceScore).toBeGreaterThan(singleSourceScore);
    expect(multiSourceScore - singleSourceScore).toBeGreaterThan(0.2);
  });

  it('ranks a corroborated event above an isolated fresh singleton', () => {
    const freshSingleton = {
      freshness: 1,
      quality: 0.7,
      interestScore: 0,
      event: {
        articleCount: 1,
        sourceCount: 1,
        sourceDiversityScore: 0
      },
      Tags: []
    };

    const developingEvent = {
      freshness: 0.55,
      quality: 0.7,
      interestScore: 0,
      event: {
        articleCount: 8,
        sourceCount: 6,
        sourceDiversityScore: 1.9
      },
      Tags: []
    };

    expect(computeRecommended(developingEvent)).toBeGreaterThan(computeRecommended(freshSingleton));
  });

  it('prioritizes articles with stronger interest affinity', () => {
    const baseArticle = {
      freshness: 0.5,
      quality: 0.7,
      event: {
        articleCount: 12,
        sourceCount: 3,
        sourceDiversityScore: 1.4
      },
      Tags: []
    };

    const lowInterestScore = computeRecommended({
      ...baseArticle,
      interestScore: -1
    });
    const neutralInterestScore = computeRecommended({
      ...baseArticle,
      interestScore: 0
    });
    const highInterestScore = computeRecommended({
      ...baseArticle,
      interestScore: 1
    });

    expect(highInterestScore).toBeGreaterThan(lowInterestScore);
    expect(neutralInterestScore).toBeGreaterThan(lowInterestScore);
    expect(highInterestScore - lowInterestScore).toBeCloseTo(0.44, 3);
  });

  it('adds bounded feed trust only when high-trust prioritization is enabled', () => {
    const article = {
      freshness: 0,
      quality: 0,
      interestScore: 0,
      Feed: { feedTrust: 0.8 },
      event: { articleCount: 1, sourceCount: 1, sourceDiversityScore: 0 },
      Tags: []
    };

    expect(computeRecommended(article)).toBe(0);
    expect(computeRecommended(article, { prioritizeHighTrust: true })).toBe(0.8);
  });

  it('clamps invalid and out-of-range feed trust boosts', () => {
    const baseArticle = {
      freshness: 0,
      quality: 0,
      interestScore: 0,
      event: { articleCount: 1, sourceCount: 1, sourceDiversityScore: 0 },
      Tags: []
    };

    expect(computeRecommended({ ...baseArticle, Feed: { feedTrust: 4 } }, {
      prioritizeHighTrust: true
    })).toBe(1);
    expect(computeRecommended({ ...baseArticle, Feed: { feedTrust: 'invalid' } }, {
      prioritizeHighTrust: true
    })).toBe(0);
  });

  it('explains bounded recommendation signals and rule boosts', () => {
    const breakdown = computeRecommendedBreakdown({
      freshness: 0.8,
      interestScore: 4,
      quality: 0.9,
      event: {
        articleCount: 128,
        sourceCount: 16,
        sourceDiversityScore: 5
      },
      Tags: [{ tagType: 'rule' }]
    });

    expect(breakdown).toMatchObject({
      freshness: 0.8,
      interestScore: 1,
      quality: 0.9,
      coverage: 1,
      crossSource: 1,
      corroboration: 1,
      eventBoost: 0.1,
      ruleBoost: 0.15,
      eventArticleCount: 128,
      sourceCount: 16,
      recommended: 1
    });
  });

  it('explains defaults and invalid event metadata without producing NaN', () => {
    const breakdown = computeRecommendedBreakdown({
      interestScore: 'invalid',
      get: key => key === 'event' ? { articleCount: 0, sourceCount: 0 } : undefined
    });

    expect(breakdown).toMatchObject({
      freshness: 0.5,
      interestScore: 0,
      quality: 0.7,
      coverage: 0,
      eventBoost: 0,
      ruleBoost: 0,
      eventArticleCount: 1,
      sourceCount: 1
    });
    expect(Number.isFinite(breakdown.recommended)).toBe(true);
  });

  it('includes the optional feed-trust boost in the score breakdown', () => {
    const breakdown = computeRecommendedBreakdown({
      freshness: 0,
      quality: 0,
      interestScore: 0,
      Feed: { feedTrust: 0.65 },
      event: { articleCount: 1, sourceCount: 1, sourceDiversityScore: 0 },
      Tags: []
    }, { prioritizeHighTrust: true });

    expect(breakdown.feedTrustBoost).toBe(0.65);
    expect(breakdown.recommended).toBe(0.65);
  });

  it('serializes applicable promotion reasons with their domain metadata', () => {
    const recommendation = buildRecommendationPresentation({
      freshness: 0.8,
      interestScore: 0.7,
      quality: 0.9,
      Feed: { feedTrust: 0.6 },
      event: {
        id: 12,
        name: 'Example event',
        articleCount: 8,
        sourceCount: 4,
        sourceDiversityScore: 1.5
      },
      Tags: [{ id: 4, name: 'JavaScript', tagType: 'rule' }]
    }, {
      prioritizeHighTrust: true,
      interestIsland: { id: 7, name: 'Software development' }
    });

    expect(recommendation.score).toBeGreaterThan(0);
    expect(recommendation.reasons.map(reason => reason.code)).toEqual([
      'interest_match',
      'event_coverage',
      'source_diversity',
      'rule_match',
      'freshness',
      'quality',
      'feed_trust'
    ]);
    expect(recommendation.reasons[0]).toMatchObject({
      island: { id: 7, name: 'Software development' }
    });
    expect(recommendation.reasons[1]).toMatchObject({
      articleCount: 8,
      event: { id: 12, name: 'Example event' }
    });
    expect(recommendation.reasons[2]).toMatchObject({ sourceCount: 4 });
    expect(recommendation.reasons[3]).toMatchObject({
      tags: [{ id: 4, name: 'JavaScript' }]
    });
  });

  it('omits signals that did not promote the article', () => {
    const recommendation = buildRecommendationPresentation({
      freshness: 0.4,
      interestScore: -0.8,
      quality: 0.6,
      event: { articleCount: 1, sourceCount: 1, sourceDiversityScore: 0 },
      Tags: []
    });

    expect(recommendation.reasons.map(reason => reason.code)).toEqual([
      'freshness',
      'quality'
    ]);
  });
});
