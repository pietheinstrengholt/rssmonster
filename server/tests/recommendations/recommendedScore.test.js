import { describe, expect, it } from 'vitest';
import {
  buildRecommendationPresentation,
  computeRecommended,
  computeRecommendedBreakdown
} from '../../services/recommendations/recommendedScore.js';

const articleWith = ({
  interestScore = 0,
  freshness = 0.5,
  quality = 0.5,
  event = null,
  tags = []
} = {}) => ({
  interestScore,
  freshness,
  qualityScore: quality * 100,
  sentimentScore: quality * 100,
  advertisementScore: quality * 100,
  Feed: { feedTrust: quality },
  event,
  Tags: tags
});

const strongEvent = {
  id: 12,
  name: 'Widely covered event',
  articleCount: 64,
  sourceCount: 8,
  sourceDiversityScore: Math.log(9)
};

describe('computeRecommended', () => {
  it('materially raises ranking for strong positive interest', () => {
    const neutral = computeRecommended(articleWith({ interestScore: 0 }));
    const interested = computeRecommended(articleWith({ interestScore: 1 }));

    expect(interested - neutral).toBeCloseTo(0.45, 6);
  });

  it('applies negative interest as an asymmetric penalty', () => {
    const neutral = computeRecommended(articleWith({ interestScore: 0 }));
    const negative = computeRecommended(articleWith({ interestScore: -0.5 }));

    expect(neutral - negative).toBeCloseTo(0.15, 6);
  });

  it('ranks fresh articles above otherwise-equal stale articles', () => {
    const stale = computeRecommended(articleWith({ freshness: 0 }));
    const fresh = computeRecommended(articleWith({ freshness: 1 }));

    expect(fresh - stale).toBeCloseTo(0.25, 6);
  });

  it('uses Quality as a secondary signal that does not dominate interest', () => {
    const highQuality = computeRecommended(articleWith({ quality: 1 }));
    const lowQuality = computeRecommended(articleWith({ quality: 0 }));
    const interested = computeRecommended(articleWith({ quality: 0, interestScore: 1 }));

    expect(highQuality - lowQuality).toBeCloseTo(0.2, 6);
    expect(interested).toBeGreaterThan(highQuality);
  });

  it('gives full corroboration only a modest advantage', () => {
    const standalone = computeRecommended(articleWith());
    const corroborated = computeRecommended(articleWith({ event: strongEvent }));

    expect(corroborated - standalone).toBeCloseTo(0.1, 6);
  });

  it('does not let event size dominate a highly relevant niche article', () => {
    const largeEvent = computeRecommended(articleWith({ event: strongEvent }));
    const relevantStandalone = computeRecommended(articleWith({ interestScore: 0.5 }));

    expect(relevantStandalone).toBeGreaterThan(largeEvent);
  });

  it('adds one 0.08 rule boost without stacking multiple rule tags', () => {
    const base = computeRecommended(articleWith());
    const oneRule = computeRecommended(articleWith({ tags: [{ tagType: 'rule' }] }));
    const twoRules = computeRecommended(articleWith({
      tags: [{ tagType: 'rule' }, { tagType: 'rule' }]
    }));

    expect(oneRule - base).toBeCloseTo(0.08, 6);
    expect(twoRules).toBe(oneRule);
  });

  it('does not add raw feed trust when high-trust prioritization is enabled', () => {
    const lowTrust = articleWith({ quality: 0.5 });
    const highTrust = { ...lowTrust, Feed: { feedTrust: 1 } };
    const ordinary = computeRecommended(highTrust);
    const preferenceEnabled = computeRecommended(highTrust, { prioritizeHighTrust: true });

    expect(preferenceEnabled).toBe(ordinary);
    expect(ordinary - computeRecommended(lowTrust)).toBeCloseTo(0.03, 6);
  });

  it('keeps final scores within zero and one', () => {
    expect(computeRecommended(articleWith({ interestScore: -5, freshness: -2, quality: 0 })))
      .toBe(0);
    expect(computeRecommended(articleWith({
      interestScore: 5,
      freshness: 5,
      quality: 1,
      event: strongEvent,
      tags: [{ tagType: 'rule' }]
    }))).toBe(1);
  });

  it('exposes the signed-interest and shared-event breakdown', () => {
    const breakdown = computeRecommendedBreakdown(articleWith({
      interestScore: -0.4,
      event: strongEvent,
      tags: [{ tagType: 'rule' }]
    }));

    expect(breakdown).toMatchObject({
      interestScore: -0.4,
      positiveInterest: 0,
      negativeInterest: 0.4,
      coverage: 1,
      crossSource: 1,
      corroboration: 1,
      ruleBoost: 0.08
    });
  });

  it('serializes only signals that positively promoted the article', () => {
    const presentation = buildRecommendationPresentation(articleWith({
      interestScore: 0.7,
      freshness: 0.8,
      quality: 0.9,
      event: strongEvent,
      tags: [{ id: 4, name: 'JavaScript', tagType: 'rule' }]
    }), {
      prioritizeHighTrust: true,
      interestIsland: { id: 7, name: 'Software development' }
    });

    expect(presentation.reasons.map(reason => reason.code)).toEqual([
      'interest_match',
      'source_diversity',
      'rule_match',
      'freshness',
      'quality'
    ]);
    expect(presentation.reasons[0]).toMatchObject({
      island: { id: 7, name: 'Software development' }
    });
    expect(presentation.reasons[1]).toMatchObject({
      sourceCount: 8,
      event: { id: 12, name: 'Widely covered event' }
    });
  });
});
