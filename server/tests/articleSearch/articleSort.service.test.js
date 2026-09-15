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

import { sortArticles, balanceRecommendedFeeds } from '../../services/articleSearch/articleSort.service.js';

describe('articleSort.service', () => {
  it('interleaves the highest-ranked alternative after two articles without changing scores or feed order', () => {
    mocked.computeRecommended.mockImplementation(article => article.rank);
    const articles = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, feedId: i < 6 ? 1 : i - 4, rank: 1 - i / 10 }));
    const original = structuredClone(articles);
    const result = sortArticles(articles, { sortRecommended: true });
    expect(result.map(article => article.id)).toEqual([1, 2, 7, 3, 4, 8, 5, 6]);
    expect(result.filter(article => article.feedId === 1).map(article => article.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(articles).toEqual(original);
    expect(result.every(article => articles.includes(article))).toBe(true);
  });

  it('leaves a single-feed or missing-source list unchanged', () => {
    for (const feedId of [1, undefined]) {
      const articles = Array.from({ length: 6 }, (_, id) => ({ id, feedId }));
      expect(balanceRecommendedFeeds(articles)).toBe(articles);
    }
    expect(balanceRecommendedFeeds([])).toEqual([]);
  });

  it('matches the greedy rule for every short three-feed sequence', () => {
    for (let seed = 0; seed < 2187; seed++) {
      let value = seed;
      const input = Array.from({ length: 7 }, (_, id) => {
        const feedId = value % 3;
        value = Math.floor(value / 3);
        return { id, feedId };
      });
      const remaining = [...input];
      const expected = [];
      while (remaining.length) {
        const previous = expected.at(-1)?.feedId;
        const blocked = expected.length >= 2 && expected.at(-2).feedId === previous;
        const alternate = blocked ? remaining.findIndex(article => article.feedId !== previous) : 0;
        expected.push(remaining.splice(Math.max(0, alternate), 1)[0]);
      }
      expect(balanceRecommendedFeeds(input)).toEqual(expected);
    }
  });

  it('handles a long dominant-feed tail after alternatives are exhausted', () => {
    const articles = Array.from({ length: 10000 }, (_, id) => ({ id, feedId: id === 9999 ? 2 : 1 }));
    const result = balanceRecommendedFeeds(articles);
    expect(result.slice(0, 4).map(article => article.id)).toEqual([0, 1, 9999, 2]);
    expect(result).toHaveLength(10000);
    expect(new Set(result.map(article => article.id)).size).toBe(10000);
  });

  it('does not use a filtered-out article as a source separator', () => {
    mocked.computeRecommended.mockImplementation(article => article.id);
    const result = sortArticles([
      { id: 4, feedId: 1, freshness: 1 },
      { id: 3, feedId: 1, freshness: 1 },
      { id: 2, feedId: 1, freshness: 1 },
      { id: 1, feedId: 2, freshness: 0 }
    ], { sortRecommended: true, freshnessFilter: { operator: '>', value: 0 } });
    expect(result.map(article => article.id)).toEqual([4, 3, 2]);
  });

  it.each([{}, { sortTopStories: true }, { sortQuality: true }])('does not balance other sorting modes: %j', options => {
    mocked.computeTopStories.mockImplementation(article => article.id);
    const articles = [4, 3, 2, 1].map(id => ({
      id, feedId: id === 1 ? 2 : 1, qualityScore: id * 20
    }));
    expect(sortArticles(articles, options).map(article => article.id)).toEqual([4, 3, 2, 1]);
  });

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

  // Adds feed trust to both chronological directions using freshness as the base score.
  it.each([
    ['desc', [{ id: 1, freshness: 0.9, Feed: { feedTrust: 0.1 } }, { id: 2, freshness: 0.4, Feed: { feedTrust: 0.9 } }]],
    ['asc', [{ id: 1, freshness: 0.1, Feed: { feedTrust: 0.1 } }, { id: 2, freshness: 0.8, Feed: { feedTrust: 0.9 } }]]
  ])('boosts %s chronological sorting with feed trust', (sortDirection, articles) => {
    const result = sortArticles(articles, { sortDirection, prioritizeHighTrust: true });

    expect(result.map(article => article.id)).toEqual([2, 1]);
  });

});
