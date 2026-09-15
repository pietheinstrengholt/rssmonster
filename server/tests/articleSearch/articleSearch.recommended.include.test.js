import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { searchArticles } from '../../services/articleSearch/articleSearch.service.js';

const { Article, BriefingPreference, Feed, Setting, Tag } = db;

describe('articleSearch recommended include wiring', () => {
  beforeEach(() => {
    vi.spyOn(Setting, 'findOne').mockResolvedValue({
      minAdvertisementScore: 0,
      minSentimentScore: 0,
      minQualityScore: 0
    });

    vi.spyOn(Feed, 'findAll').mockResolvedValue([{ id: 1 }]);
    vi.spyOn(Tag, 'findAll').mockResolvedValue([]);
    vi.spyOn(Article, 'findAll').mockResolvedValue([]);
    vi.spyOn(BriefingPreference, 'findOne').mockResolvedValue({
      selectionPeriod: '7d',
      includeOnlyUnreadArticles: false,
      minDistinctSources: 1,
      prioritizeHighTrust: false,
      showOnlyInterestMatchedArticles: false,
      showOnlyDevelopingEventArticles: false
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { sort: 'recommended', search: 'limit:3' },
    { search: 'sort:recommended limit:3', smartFolderSearch: true }
  ])('balances Recommended sources before limiting the ID collection: %j', async selection => {
    Feed.findAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    Article.findAll.mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      feedId: index === 4 ? 2 : 1,
      interestScore: 1 - index / 10,
      freshness: 0.5
    })));

    const result = await searchArticles({ userId: 1, status: '%', ...selection });

    expect(result.itemIds).toEqual([1, 2, 5]);
    expect(Article.findAll.mock.calls[0][0].attributes).toContain('feedId');
  });

  it('includes event association when sorting by recommended', async () => {
    await searchArticles({ userId: 1, sort: 'recommended', status: '%' });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    expect(query.include).toBeDefined();
    const eventInclude = query.include.find(item => item.as === 'event');
    expect(eventInclude).toBeDefined();
    expect(eventInclude.attributes).toEqual(
      expect.arrayContaining(['articleCount', 'sourceDiversityScore', 'sourceCount'])
    );
  });

  it('includes event association in smartFolderSearch mode when sort:recommended is requested', async () => {
    await searchArticles({
      userId: 1,
      search: 'sort:recommended',
      status: '%',
      smartFolderSearch: true
    });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    const eventInclude = query.include.find(item => item.as === 'event');
    expect(eventInclude).toBeDefined();
  });

  it('includes event and feed quality associations when sorting by Top Stories', async () => {
    await searchArticles({ userId: 1, sort: 'topStories', status: '%' });

    const query = Article.findAll.mock.calls[0][0];
    expect(query.include.find(item => item.as === 'event')).toBeDefined();
    expect(query.include.find(item => item.model === Feed)).toBeDefined();
    expect(query.include.find(item => item.model === Tag)).toBeUndefined();
    expect(query.attributes).not.toContain('interestScore');
  });

  it('uses Top Stories ranking without dropping the canonical briefing scope', async () => {
    await searchArticles({
      userId: 1,
      status: 'briefing',
      briefingSort: 'topStories',
      executionBounds: { maxResults: 20, maxCandidates: 500 }
    });

    const query = Article.findAll.mock.calls[0][0];
    expect(query.include.find(item => item.as === 'event')).toBeDefined();
    expect(query.include.find(item => item.model === Feed)).toBeDefined();
    expect(query.include.find(item => item.model === Tag)).toBeUndefined();
    expect(query.limit).toBe(500);
  });

  it('includes feed quality fields when sorting by quality', async () => {
    await searchArticles({ userId: 1, sort: 'quality', status: '%' });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    const feedInclude = query.include.find(item => item.model === Feed);
    expect(feedInclude).toBeDefined();
    expect(feedInclude.attributes).toEqual(
      expect.arrayContaining(['feedTrust', 'feedDuplicationRate', 'feedAttentionSampleSize'])
    );
  });
});
