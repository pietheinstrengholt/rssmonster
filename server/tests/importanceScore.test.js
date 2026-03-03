import { describe, expect, it } from 'vitest';
import { computeImportance } from '../util/importanceScore.js';

describe('computeImportance', () => {
  it('ranks larger corroborated clusters higher with equal freshness/quality', () => {
    const standalone = {
      freshness: 0.5,
      quality: 0.7,
      get: (key) => {
        if (key === 'cluster') return { articleCount: 1, sourceDiversityScore: 0 };
        if (key === 'Tags') return [];
        return undefined;
      }
    };

    const highlyCorroborated = {
      freshness: 0.5,
      quality: 0.7,
      get: (key) => {
        if (key === 'cluster') return { articleCount: 32, sourceDiversityScore: 2.0 };
        if (key === 'Tags') return [];
        return undefined;
      }
    };

    expect(computeImportance(highlyCorroborated)).toBeGreaterThan(computeImportance(standalone));
  });

  it('reads cluster associations from plain object properties when get() is not present', () => {
    const article = {
      freshness: 0.6,
      quality: 0.7,
      cluster: { articleCount: 20, sourceDiversityScore: 1.8 },
      Tags: []
    };

    const score = computeImportance(article);

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

    const singleSourceScore = computeImportance(sameSizeSingleSource);
    const multiSourceScore = computeImportance(sameSizeMultiSource);

    expect(multiSourceScore).toBeGreaterThan(singleSourceScore);
    expect(multiSourceScore - singleSourceScore).toBeGreaterThan(0.2);
  });
});
