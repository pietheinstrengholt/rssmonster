import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  computeRecommended: vi.fn(),
  computeTopStories: vi.fn(),
  debugRecommendedScores: vi.fn()
}));

vi.mock('../../services/recommendations/recommendedScore.js', () => ({
  computeRecommended: mocked.computeRecommended
}));

vi.mock('../../services/recommendations/topStoriesScore.js', () => ({
  computeTopStories: mocked.computeTopStories
}));

vi.mock('../../services/articleSearch/articleDebug.service.js', () => ({
  debugRecommendedScores: mocked.debugRecommendedScores
}));

import { sortArticles } from '../../services/articleSearch/articleSort.service.js';

describe('articleSort.service', () => {
  // Resets ranking collaborators and suppresses filter diagnostics between scenarios.
  beforeEach(() => {
    mocked.computeRecommended.mockReset();
    mocked.computeTopStories.mockReset();
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

  it.each(['pending', 'failed'])(
    'applies quality filters to %s action-owned scores while exempting placeholders',
    aiAnalysisStatus => {
      const result = sortArticles([
        { id: 1, quality: 0, aiAnalysisStatus, qualityScoreActionOverrideInd: false },
        { id: 2, quality: 0, aiAnalysisStatus, qualityScoreActionOverrideInd: true },
        { id: 3, quality: 3, aiAnalysisStatus, qualityScoreActionOverrideInd: true }
      ], {
        qualityFilter: { operator: '>=', value: 2 }
      });

      expect(result.map(article => article.id)).toEqual([1, 3]);
    }
  );

  // Sorts recommended articles and sends the same scores to development diagnostics.
  it('sorts by recommended score and reports the breakdown input', () => {
    mocked.computeRecommended.mockImplementation(article => article.rank);
    const articles = [{ id: 1, rank: 0.2 }, { id: 2, rank: 0.9 }];

    const result = sortArticles(articles, { sortRecommended: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
    expect(mocked.computeRecommended).toHaveBeenCalledWith(expect.any(Object));
    expect(mocked.debugRecommendedScores).toHaveBeenCalledWith([
      { article: articles[1], recommended: 0.9 },
      { article: articles[0], recommended: 0.2 }
    ]);
  });

  it('sorts Top Stories without using the Recommended scorer', () => {
    mocked.computeTopStories.mockImplementation(article => article.rank);
    const articles = [{ id: 1, rank: 0.8 }, { id: 2, rank: 0.3 }];

    const result = sortArticles(articles, { sortTopStories: true });

    expect(result.map(article => article.id)).toEqual([1, 2]);
    expect(mocked.computeTopStories).toHaveBeenCalledTimes(2);
    expect(mocked.computeRecommended).not.toHaveBeenCalled();
  });

  it('breaks equal intelligent scores by publication date and article id descending', () => {
    mocked.computeTopStories.mockReturnValue(0.5);
    const result = sortArticles([
      { id: 3, publishedAt: '2026-01-01T00:00:00Z' },
      { id: 1, publishedAt: '2026-01-02T00:00:00Z' },
      { id: 2, publishedAt: '2026-01-02T00:00:00Z' }
    ], { sortTopStories: true });

    expect(result.map(article => article.id)).toEqual([2, 1, 3]);
  });

  // Sorts by virtual quality values from highest to lowest.
  it('sorts by quality score', () => {
    const result = sortArticles([
      { id: 1, qualityScore: 30, sentimentScore: 30, advertisementScore: 30 },
      { id: 2, qualityScore: 80, sentimentScore: 80, advertisementScore: 80 }
    ], { sortQuality: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

  // Applies the fixed 70/30 Quality formula without an additional preference boost.
  it('combines article quality and feed trust with fixed weights', () => {
    const result = sortArticles([
      { id: 1, qualityScore: 60, sentimentScore: 60, advertisementScore: 60, Feed: { feedTrust: 0.1 } },
      { id: 2, qualityScore: 30, sentimentScore: 30, advertisementScore: 30, Feed: { feedTrust: 1 } }
    ], { sortQuality: true, prioritizeHighTrust: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

  it('bounds feed trust and uses the neutral fallback when it is missing', () => {
    const result = sortArticles([
      { id: 1, qualityScore: 50, sentimentScore: 50, advertisementScore: 50, Feed: { feedTrust: -1 } },
      { id: 2, qualityScore: 30, sentimentScore: 30, advertisementScore: 30 },
      { id: 3, qualityScore: 10, sentimentScore: 10, advertisementScore: 10, Feed: { feedTrust: 4 } }
    ], { sortQuality: true });

    expect(result.map(article => article.id)).toEqual([3, 2, 1]);
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

});
