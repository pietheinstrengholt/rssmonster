import { describe, expect, it } from 'vitest';
import { behavioralIntent, behavioralIntentCompatibility } from '../../services/islands/behavioralIntent.js';
import { evaluateArticleInterest } from '../../services/islands/islandInterestConfidence.js';

const now = Date.parse('2026-09-13T12:00:00Z');
const promotion = { id: 1, title: 'Save $2,400 on an Alienware gaming laptop deal', negativeInd: 1, advertisementScore: 10,
  publishedAt: new Date(now), articleVector: [1, 0, 0] };
const vector = [0.95, Math.sqrt(1 - 0.95 ** 2), 0];
const score = (source, title, v = vector) => evaluateArticleInterest({ id: 99, title, articleVector: v },
  { islands: [], fallbackEvidence: [source], now });

describe('held-out explicit behavioral intent gold', () => {
  it('transfers promotional dislikes to promotions and attenuates reviews, even for the same product', () => {
    const deal = score(promotion, 'Another Alienware gaming laptop deal saves $500');
    const review = score(promotion, 'Razer gaming laptop review and benchmarks');
    const unrelated = score(promotion, 'Technical review of a network switch', [0, 1, 0]);
    const sameProduct = score(promotion, 'Alienware gaming laptop technical review');
    expect(deal.score).toBeLessThan(-0.2);
    expect(Math.abs(review.score)).toBeLessThan(Math.abs(deal.score) / 10);
    expect(unrelated.score).toBe(0);
    expect(sameProduct.score).toBe(review.score);
    expect(review.paths[0]).toMatchObject({ intentCompatibility: 0.05, sourceIntent: 'promotion', targetIntent: 'review', seedSelf: false });
    expect(score(promotion, 'Another Alienware gaming laptop deal saves $500').score).toBe(deal.score);
    console.table([{ scenario: 'promotion → promotion', score: deal.score }, { scenario: 'promotion → review', score: review.score },
      { scenario: 'promotion → unrelated technical review', score: unrelated.score }, { scenario: 'same product, promotion → review', score: sameProduct.score }]);
  });

  it('applies equivalent intent specificity to explicit positive evidence', () => {
    const review = { ...promotion, negativeInd: 0, favoriteInd: 1, title: 'Alienware laptop technical review', advertisementScore: 90 };
    const related = score(review, 'Razer laptop review');
    expect(related.score).toBeGreaterThan(0.2);
    const technical = { ...review, title: 'Local inference performance and kernel tuning' };
    const relatedTechnical = score(technical, 'Local inference kernel improvements');
    const promotionMatch = score(technical, 'Local inference server discount deal');
    expect(relatedTechnical.score).toBeGreaterThan(0.2);
    expect(promotionMatch.score).toBeGreaterThan(0);
    expect(promotionMatch.score).toBeLessThan(relatedTechnical.score / 10);
  });

  it('keeps missing intent conservative and respects the existing advertisement-score direction', () => {
    expect(behavioralIntent({ advertisementScore: 10, aiAnalysisCompletedAt: new Date(now) }).type).toBe('promotion');
    expect(behavioralIntent({ advertisementScore: 90, advertisementScoreActionOverrideInd: 1 }).type).toBe('editorial');
    expect(behavioralIntent({ advertisementScore: 0, aiAnalysisStatus: 'complete' }).type).toBe('unknown');
    expect(behavioralIntent({ title: 'A redesigned laptop with an OLED display', advertisementScore: 0 }).type).toBe('product-report');
    expect(behavioralIntent({ advertisementScore: null }).type).toBe('unknown');
    expect(behavioralIntentCompatibility({}, promotion)).toMatchObject({ intentCompatibility: 0.5, intentMatchType: 'missing-intent' });
    expect(behavioralIntent({ title: 'An independent review', advertisementScore: 10 }).type).toBe('review');
    expect(behavioralIntent({ title: 'Unexpected results', description: 'In this review we tested the new laptop.' }).type).toBe('review');
  });
});
