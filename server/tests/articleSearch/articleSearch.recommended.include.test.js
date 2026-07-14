import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { searchArticles } from '../../services/articleSearch/articleSearch.service.js';

const { Article, Feed, Setting, Tag } = db;

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes cluster association when sorting by recommended', async () => {
    await searchArticles({ userId: 1, sort: 'recommended', status: '%' });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    expect(query.include).toBeDefined();
    const clusterInclude = query.include.find(item => item.as === 'cluster');
    expect(clusterInclude).toBeDefined();
    expect(clusterInclude.attributes).toEqual(
      expect.arrayContaining(['articleCount', 'sourceDiversityScore', 'sourceCount'])
    );
  });

  it('includes cluster association in smartFolderSearch mode when sort:recommended is requested', async () => {
    await searchArticles({
      userId: 1,
      search: 'sort:recommended',
      status: '%',
      smartFolderSearch: true
    });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    const clusterInclude = query.include.find(item => item.as === 'cluster');
    expect(clusterInclude).toBeDefined();
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
