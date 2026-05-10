import { describe, expect, it } from 'vitest';
import { computeRecommended } from '../util/recommendedScore.js';

describe('computeRecommended', () => {
  it('ranks larger corroborated clusters higher with equal freshness/quality', () => {
    const standalone = {
      freshness: 0.8,
      quality: 0.75,
      cluster: { articleCount: 1, sourceDiversityScore: 0 },
      get: (key) => (key === 'cluster' ? { articleCount: 1, sourceDiversityScore: 0 } : undefined)
    };

    const highlyCorroborated = {
      freshness: 0.8,
      quality: 0.75,
      cluster: { articleCount: 32, sourceDiversityScore: 2.0 },
      get: (key) => (key === 'cluster' ? { articleCount: 32, sourceDiversityScore: 2.0 } : undefined)
    };

    expect(computeRecommended(highlyCorroborated)).toBeGreaterThan(computeRecommended(standalone));
  });

  it('reads cluster associations from plain object properties when get() is not present', () => {
    const article = {
      freshness: 0.5,
      quality: 0.6,
      cluster: { articleCount: 20, sourceDiversityScore: 1.8 },
      Tags: []
    };

    const score = computeRecommended(article);
    expect(score).toBeGreaterThan(0);
  });

  it('strongly prioritizes same-size clusters when corroborated by more sources', () => {
    const sameSizeSingleSource = {
      freshness: 0.7,
      quality: 0.7,
      cluster: { articleCount: 8, sourceDiversityScore: 0.2, sourceCount: 1 }
    };

    const sameSizeMultiSource = {
      freshness: 0.7,
      quality: 0.7,
      cluster: { articleCount: 8, sourceDiversityScore: 1.8, sourceCount: 5 }
    };

    const singleSourceScore = computeRecommended(sameSizeSingleSource);
    const multiSourceScore = computeRecommended(sameSizeMultiSource);

    expect(multiSourceScore).toBeGreaterThan(singleSourceScore);
  });

  it('keeps similarity contributing when present', () => {
    const lowSimilarity = {
      freshness: 0.5,
      quality: 0.5,
      similarityScore: 0.1,
      cluster: { articleCount: 4, sourceDiversityScore: 0.5 }
    };

    const highSimilarity = {
      freshness: 0.5,
      quality: 0.5,
      similarityScore: 0.9,
      cluster: { articleCount: 4, sourceDiversityScore: 0.5 }
    };

    const lowSimilarityScore = computeRecommended(lowSimilarity);
    const highSimilarityScore = computeRecommended(highSimilarity);

    expect(highSimilarityScore).toBeGreaterThan(lowSimilarityScore);
  });
});