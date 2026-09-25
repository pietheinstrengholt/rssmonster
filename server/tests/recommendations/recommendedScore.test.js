import { describe, expect, it } from 'vitest';
import { sortArticles } from '../../services/articleSearch/articleSort.service.js';
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
  it('adds a flat Hot bonus without scaling by hotlink count', () => {
    const article = articleWith();
    const base = computeRecommended(article);
    for (const hotlinks of [0, 1, 100]) {
      expect(computeRecommended({ ...article, hotInd: 1, hotlinks }) - base).toBeCloseTo(0.07, 6);
      expect(computeRecommended({ ...article, hotInd: 0, hotlinks })).toBe(base);
    }
    expect(computeRecommendedBreakdown({ ...article, hotInd: 1 }).hotBoost).toBe(0.07);
  });

  it('combines Hot and rule bonuses while preserving negative scores', () => {
    const article = { ...articleWith({ interestScore: -1, freshness: 0, quality: 0,
      tags: [{ tagType: 'rule' }] }), hotInd: 1 };
    expect(computeRecommended(article)).toBeCloseTo(-0.15, 6);
  });

  it('caps a Hot article at one', () => {
    expect(computeRecommended({
      ...articleWith({ interestScore: 1, freshness: 1, quality: 1,
        event: { articleCount: 64, sourceCount: 8, sourceDiversityScore: Math.log(9) } }),
      hotInd: 1
    })).toBe(1);
  });

  it('scores articles with no optional semantic evidence using neutral interest', () => {
    const noSemanticEvidence = articleWith();
    expect(computeRecommendedBreakdown(noSemanticEvidence)).toMatchObject({ interestScore: 0, corroboration: 0 });
    expect(computeRecommended(noSemanticEvidence)).toBeCloseTo(0.15);
    expect(Number.isFinite(computeRecommended({}))).toBe(true);
    for (const interestScore of [0, 0.8, -0.8]) {
      expect(Number.isFinite(computeRecommended(articleWith({ interestScore })))).toBe(true);
    }
  });

  it('materially raises ranking for strong positive interest', () => {
    const neutral = computeRecommended(articleWith({ interestScore: 0 }));
    const interested = computeRecommended(articleWith({ interestScore: 1 }));

    expect(interested - neutral).toBeCloseTo(0.60, 6);
  });

  it('ranks moderate interest above a fresher, higher-quality neutral article', () => {
    const interested = { id: 1, ...articleWith({ interestScore: 0.2, freshness: 0.5, quality: 0.7 }) };
    const neutral = { id: 2, ...articleWith({ freshness: 1, quality: 0.8 }) };

    expect(sortArticles([neutral, interested], { sortRecommended: true }).map(article => article.id))
      .toEqual([1, 2]);
  });

  it('applies negative interest as an asymmetric penalty', () => {
    const neutral = computeRecommended(articleWith({ interestScore: 0 }));
    const negative = computeRecommended(articleWith({ interestScore: -0.5 }));

    expect(neutral - negative).toBeCloseTo(0.15, 6);
  });

  it('ranks fresh articles above otherwise-equal stale articles', () => {
    const stale = computeRecommended(articleWith({ freshness: 0 }));
    const fresh = computeRecommended(articleWith({ freshness: 1 }));

    expect(fresh - stale).toBeCloseTo(0.17, 6);
  });

  it('uses Quality as a secondary signal that does not dominate interest', () => {
    const highQuality = computeRecommended(articleWith({ quality: 1 }));
    const lowQuality = computeRecommended(articleWith({ quality: 0 }));
    const interested = computeRecommended(articleWith({ quality: 0, interestScore: 1 }));

    expect(highQuality - lowQuality).toBeCloseTo(0.13, 6);
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
    expect(ordinary - computeRecommended(lowTrust)).toBeCloseTo(0.0195, 6);
  });

  it('preserves the negative lower bound and established upper cap', () => {
    expect(computeRecommended(articleWith({ interestScore: -5, freshness: -2, quality: 0 })))
      .toBe(-0.30);
    expect(computeRecommended(articleWith({
      interestScore: 5,
      freshness: 5,
      quality: 1,
      event: strongEvent,
      tags: [{ tagType: 'rule' }]
    }))).toBe(1);
  });

  it('keeps distinct negative totals ordered below neutral and positive totals', () => {
    const articles = [-1, -0.5, 0, 0.5].map((interestScore, index) => ({
      id: 4 - index, ...articleWith({ interestScore, freshness: 0, quality: 0 })
    }));
    expect(articles.map(computeRecommended)).toEqual([-0.3, -0.15, 0, 0.3]);
    expect(sortArticles(articles, { sortRecommended: true }).map(article => article.id)).toEqual([1, 2, 3, 4]);
  });

  it('serializes a negative final score without losing its sign or precision', () => {
    const article = articleWith({ interestScore: -0.54321, freshness: 0, quality: 0 });
    expect(JSON.parse(JSON.stringify(buildRecommendationPresentation(article))).score).toBe(-0.163);
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
    expect(presentation.score).toBeCloseTo(0.853, 4);
    expect(presentation.reasons.map(({ contribution }) => contribution)).toEqual([0.42, 0.1, 0.08, 0.136, 0.117]);
    expect(presentation.reasons[0]).toMatchObject({
      island: { id: 7, name: 'Software development' }
    });
    expect(presentation.reasons[1]).toMatchObject({
      sourceCount: 8,
      event: { id: 12, name: 'Widely covered event' }
    });
  });
});
