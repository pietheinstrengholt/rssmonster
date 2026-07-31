import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  computeRecommended: vi.fn(),
  debugRecommendedScores: vi.fn()
}));

vi.mock('../../services/recommendations/recommendedScore.js', () => ({
  computeRecommended: mocked.computeRecommended
}));

vi.mock('../../services/articleSearch/articleDebug.service.js', () => ({
  debugRecommendedScores: mocked.debugRecommendedScores
}));

import { sortArticles } from '../../services/articleSearch/articleSort.service.js';

describe('articleSort.service', () => {
  // Resets ranking collaborators and suppresses filter diagnostics between scenarios.
  beforeEach(() => {
    mocked.computeRecommended.mockReset();
    mocked.debugRecommendedScores.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // Applies all supported comparison operators to runtime quality gates.
  it.each([
    ['=', [2]],
    ['>', [3]],
    ['<', [1]],
    ['>=', [2, 3]],
    ['<=', [1, 2]],
    ['unsupported', [1, 2, 3]]
  ])('applies the %s quality comparison', (operator, expectedIds) => {
    const articles = [
      { id: 1, quality: 1 },
      { id: 2, quality: 2 },
      { id: 3, quality: 3 }
    ];

    const result = sortArticles(articles, {
      qualityFilter: { operator, value: 2 }
    });

    expect(result.map(article => article.id)).toEqual(expectedIds);
  });

  // Composes quality and freshness gates before ranking.
  it('applies quality and freshness filters cumulatively', () => {
    const result = sortArticles([
      { id: 1, quality: 3, freshness: 1 },
      { id: 2, quality: 3, freshness: 4 },
      { id: 3, quality: 1, freshness: 4 }
    ], {
      qualityFilter: { operator: '>=', value: 2 },
      freshnessFilter: { operator: '>', value: 2 }
    });

    expect(result.map(article => article.id)).toEqual([2]);
  });

  // Sorts recommended articles and sends the same scores to development diagnostics.
  it('sorts by recommended score and reports the breakdown input', () => {
    mocked.computeRecommended.mockImplementation(article => article.rank);
    const articles = [{ id: 1, rank: 0.2 }, { id: 2, rank: 0.9 }];

    const result = sortArticles(articles, { sortRecommended: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
    expect(mocked.debugRecommendedScores).toHaveBeenCalledWith([
      { article: articles[1], recommended: 0.9 },
      { article: articles[0], recommended: 0.2 }
    ]);
  });

  // Sorts by virtual quality values from highest to lowest.
  it('sorts by quality score', () => {
    const result = sortArticles([
      { id: 1, quality: 0.3 },
      { id: 2, quality: 0.8 }
    ], { sortQuality: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

  // Treats missing attention as zero while sorting descending.
  it('sorts by attention score with a zero fallback', () => {
    const result = sortArticles([
      { id: 1 },
      { id: 2, attentionScore: 4 }
    ], { sortAttention: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });
});
