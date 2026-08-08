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
    expect(mocked.computeRecommended).toHaveBeenCalledWith(
      expect.any(Object),
      { prioritizeHighTrust: false }
    );
    expect(mocked.debugRecommendedScores).toHaveBeenCalledWith([
      { article: articles[1], recommended: 0.9 },
      { article: articles[0], recommended: 0.2 }
    ], { prioritizeHighTrust: false });
  });

  // Passes the selected settings context into every recommendation score calculation.
  it('forwards high-trust prioritization to recommendation scoring', () => {
    mocked.computeRecommended.mockImplementation(article => article.rank);
    const articles = [{ id: 1, rank: 0.2 }, { id: 2, rank: 0.9 }];

    sortArticles(articles, { sortRecommended: true, prioritizeHighTrust: true });

    expect(mocked.computeRecommended).toHaveBeenCalledWith(
      expect.any(Object),
      { prioritizeHighTrust: true }
    );
    expect(mocked.debugRecommendedScores).toHaveBeenCalledWith(
      expect.any(Array),
      { prioritizeHighTrust: true }
    );
  });

  // Sorts by virtual quality values from highest to lowest.
  it('sorts by quality score', () => {
    const result = sortArticles([
      { id: 1, quality: 0.3 },
      { id: 2, quality: 0.8 }
    ], { sortQuality: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

  // Adds feed trust to Quality without replacing the selected quality signal.
  it('boosts quality sorting with feed trust', () => {
    const result = sortArticles([
      { id: 1, quality: 0.8, Feed: { feedTrust: 0.1 } },
      { id: 2, quality: 0.3, Feed: { feedTrust: 0.9 } }
    ], { sortQuality: true, prioritizeHighTrust: true });

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

  // Adds feed trust to Most Engaged without replacing the selected attention signal.
  it('boosts attention sorting with feed trust', () => {
    const result = sortArticles([
      { id: 1, attentionScore: 0.8, Feed: { feedTrust: 0.1 } },
      { id: 2, attentionScore: 0.2, Feed: { feedTrust: 0.9 } }
    ], { sortAttention: true, prioritizeHighTrust: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

  // Adds feed trust to both chronological directions using freshness as the base score.
  it.each([
    ['desc', [{ id: 1, freshness: 0.9, Feed: { feedTrust: 0.1 } }, { id: 2, freshness: 0.4, Feed: { feedTrust: 0.9 } }]],
    ['asc', [{ id: 1, freshness: 0.1, Feed: { feedTrust: 0.1 } }, { id: 2, freshness: 0.8, Feed: { feedTrust: 0.9 } }]]
  ])('boosts %s chronological sorting with feed trust', (sortDirection, articles) => {
    const result = sortArticles(articles, { sortDirection, prioritizeHighTrust: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

  // Preserves the database's exact Trust ordering instead of applying a second boost.
  it('does not re-rank explicit Trust sorting', () => {
    const articles = [
      { id: 2, freshness: 0.1, Feed: { feedTrust: 0.9 } },
      { id: 1, freshness: 0.9, Feed: { feedTrust: 0.1 } }
    ];

    const result = sortArticles(articles, {
      sortTrust: true,
      sortDirection: 'trust',
      prioritizeHighTrust: true
    });

    expect(result).toEqual(articles);
  });
});
