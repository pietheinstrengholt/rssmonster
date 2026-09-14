import { describe, expect, it } from 'vitest';
import { behavioralIntentCompatibility } from '../../services/islands/behavioralIntent.js';
import { prepareIslandEvidence, evaluateArticleInterest } from '../../services/islands/islandInterestConfidence.js';

const promotion = 'Save €500 on a gaming laptop deal';
const review = 'Gaming laptop technical review and benchmarks';
const technical = 'Gaming laptop kernel debugging guide';
const now = Date.now();
const source = (title = promotion, overrides = {}) => ({
  id: 1, title, articleVector: [1, 0], negativeInd: 1, negativeFeedbackAt: new Date(now), ...overrides
});
const candidate = (title = promotion, overrides = {}) => ({ id: 99, title, articleVector: [1, 0], ...overrides });
const context = (support = [source()], weight = -0.8) => ({
  ...prepareIslandEvidence([{ id: 1, weight, islandVector: [1, 0] }], support), now
});
const evaluate = (title, evidence = context(), overrides) => evaluateArticleInterest(candidate(title, overrides), evidence);

describe('negative Island intent scope', () => {
  it('keeps promotion dislikes strong for promotions and attenuates equally similar reviews', () => {
    const evidence = context();
    expect(evidence.fallbackEvidence).toHaveLength(0);
    const same = evaluate(promotion, evidence);
    const cross = evaluate(review, evidence);
    expect(same.score).toBeCloseTo(-0.8 * 0.35);
    expect(cross.score).toBeCloseTo(same.score * 0.05, 4);
    expect(cross.paths[0]).toMatchObject({ matchType: 'vector-fallback', sourceIntent: 'promotion',
      targetIntent: 'review', intentCompatibility: 0.05, intentMatchType: 'cross-intent-attenuated' });
    expect(same.paths[0].semanticSimilarity).toBe(cross.paths[0].semanticSimilarity);
    expect(evaluate(technical, evidence, { articleVector: [0, 1] })).toMatchObject({ score: 0, paths: [] });
  });

  it('keeps review-to-review propagation stronger than promotion-to-review propagation', () => {
    const same = evaluate(review, context([source(review)]));
    expect(same.score).toBeCloseTo(-0.28);
    expect(same.paths[0].intentCompatibility).toBe(1);
    expect(Math.abs(same.score)).toBeGreaterThan(Math.abs(evaluate(review).score) * 10);
  });

  it.each([
    [promotion, review, technical],
    [promotion, 'Unclassified dispatch'],
    ['Unclassified dispatch'],
    []
  ].map(titles => ({ titles })))('uses unknown compatibility for mixed or missing negative support: $titles', ({ titles }) => {
    const support = titles.map((title, id) => source(title, { id }));
    const evidence = context(support);
    expect(evidence.islands[0].negativeIntent).toBe('unknown');
    const result = evaluate(promotion, evidence);
    expect(result.paths[0]).toMatchObject({ sourceIntent: 'unknown', intentCompatibility: 0.5, intentMatchType: 'missing-intent' });
    expect(result.paths[0].contribution).toBeCloseTo(-0.8 * evidence.islands[0].islandConfidence * 0.5);
    expect(evaluate(promotion, context([...support].reverse()))).toEqual(result);
  });

  it('requires unanimous recognizable negative support and uses the shared unknown-target factor', () => {
    const evidence = context([source(), source(promotion, { id: 2 })]);
    expect(evidence.islands[0].negativeIntent).toBe('promotion');
    expect(evaluate(promotion, evidence).paths[0].intentCompatibility).toBe(1);
    expect(evaluate('Unclassified dispatch', evidence).paths[0].intentCompatibility).toBe(0.5);
  });

  it('uses negative flags even with contradictory engagement and ignores positive-only support intent', () => {
    const support = [source(promotion, { positiveInd: 1, favoriteInd: 1, clickedAmount: 3, attentionBucket: 4 }),
      source(review, { id: 2, negativeInd: 0, favoriteInd: 1, clickedAmount: 3, attentionBucket: 4 })];
    const evidence = context(support);
    expect(evidence.islands[0].negativeIntent).toBe('promotion');
    expect(evaluate(review, evidence).paths.find(path => path.islandId === 1).intentCompatibility).toBe(0.05);
    expect(context([support[1]]).islands[0].negativeIntent).toBe('unknown');
  });

  it('leaves positive Island contributions unchanged across candidate intents', () => {
    const evidence = context([source(promotion, { negativeInd: 0, favoriteInd: 1 })], 0.8);
    for (const title of [promotion, review, technical, 'Unclassified dispatch']) {
      const result = evaluate(title, evidence);
      expect(result.score).toBeCloseTo(0.8 * evidence.islands[0].islandConfidence);
      expect(result.paths[0]).not.toHaveProperty('intentCompatibility');
    }
  });

  it.each([[promotion, promotion, 1], [promotion, review, 0.05], [review, technical, 0.75],
    ['Unclassified dispatch', review, 0.5]])('retains explicit fallback compatibility from %s to %s', (from, to, factor) => {
    const disliked = source(from);
    expect(behavioralIntentCompatibility(disliked, candidate(to)).intentCompatibility).toBe(factor);
    const explicit = evaluate(to, { ...prepareIslandEvidence([], [disliked]), now });
    expect(explicit.score).toBeCloseTo(-0.25 * factor, 4);
    expect(explicit.paths[0].matchType).toBe('behavioral-fallback');
  });
});
