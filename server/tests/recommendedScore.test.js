import { describe, expect, it } from 'vitest';
import { computeRecommended } from '../util/recommendedScore.js';

describe('computeRecommended', () => {
  it('ranks larger corroborated clusters higher with equal freshness/quality', () => {
    const standalone = {
      freshness: 0.5,
      quality: 0.7,
      get: key => {
        if (key === 'cluster') return { articleCount: 1, sourceDiversityScore: 0 };
        if (key === 'Tags') return [];
        return undefined;
      }
    };

    const highlyCorroborated = {
      freshness: 0.5,
      quality: 0.7,
      get: key => {
        if (key === 'cluster') return { articleCount: 32, sourceDiversityScore: 2.0 };
        if (key === 'Tags') return [];
        return undefined;
      }
    };

    expect(computeRecommended(highlyCorroborated)).toBeGreaterThan(computeRecommended(standalone));
  });

  it('reads cluster associations from plain object properties when get() is not present', () => {
    const article = {
      freshness: 0.6,
      quality: 0.7,
      cluster: { articleCount: 20, sourceDiversityScore: 1.8 },
      Tags: []
    };

    const score = computeRecommended(article);

    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('strongly prioritizes same-size clusters when corroborated by more sources', () => {
    const sameSizeSingleSource = {
      freshness: 0.5,
      quality: 0.7,
      cluster: {
        articleCount: 24,
        sourceCount: 1,
        sourceDiversityScore: 0
      },
      Tags: []
    };

    const sameSizeMultiSource = {
      freshness: 0.5,
      quality: 0.7,
      cluster: {
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
      cluster: {
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
      cluster: {
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
      cluster: {
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
});
