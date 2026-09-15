import { describe, expect, it } from 'vitest';
import { islandCohesion, recommendationCoverage } from './semanticRecommendationDiagnostics.js';

describe('recommendation coverage and Island diagnostics', () => {
  it('counts finite zero scores but never masks missing or non-finite scores', () => {
    expect(recommendationCoverage([
      { recommended: 0, interestScore: 0 }, { recommended: 0.8, interestScore: 0.9 },
      { recommended: 0.1, interestScore: -0.5 }, { recommended: null, interestScore: 0 },
      { recommended: NaN, interestScore: 0 }, { recommendedEligible: false, recommended: 0.7 }
    ])).toEqual({
      'Articles eligible for Recommended': 5, 'Articles with Recommended score': 3,
      'Recommended coverage (%)': 60, 'Articles with non-zero interest': 2,
      'Articles with neutral interest': 3, 'Articles with negative interest': 1
    });
  });

  it('identifies singleton and weak evidence without treating self-similarity as strength', () => {
    const row = islandCohesion([{ id: 1, feedId: 2, embedding_model: 'test-model', articleVector: [1, 0], favoriteInd: 1, publishedAt: '2026-09-13' }], [1, 0], 'test-model');
    expect(row).toMatchObject({ singleton: true, distinctSources: 1, distinctInteractionDays: 1, medianSimilarity: 1, positiveEvidenceCount: 1 });
    expect(row.classifications).toEqual(['singleton', 'weak-behavioral-support']);
  });

  it('deduplicates evidence and reports low cohesion and mixed signs', () => {
    const a = { id: 1, feedId: 2, embedding_model: 'test-model', articleVector: [0, 1], favoriteInd: 1, publishedAt: '2026-09-12' };
    const b = { id: 2, feedId: 3, embedding_model: 'test-model', articleVector: [0, 1], negativeInd: 1, publishedAt: '2026-09-13' };
    const row = islandCohesion([a, a, b], [1, 0], 'test-model');
    expect(row).toMatchObject({ distinctBehavioralArticles: 2, distinctSources: 2, distinctInteractionDays: 2, medianSimilarity: 0, minimumSimilarity: 0, positiveEvidenceCount: 1, negativeEvidenceCount: 1 });
    expect(row.classifications).toEqual(expect.arrayContaining(['low-cohesion', 'mixed-sign-evidence']));
  });
});
