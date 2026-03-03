import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../models/index.js';
import { searchArticles } from '../util/articleSearch.service.js';

const { Article, Feed, Setting, Tag } = db;

describe('articleSearch importance include wiring', () => {
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

  it('includes cluster association when sorting by IMPORTANCE', async () => {
    await searchArticles({ userId: 1, sort: 'IMPORTANCE', status: '%' });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    expect(query.include).toBeDefined();
    const clusterInclude = query.include.find(item => item.as === 'cluster');
    expect(clusterInclude).toBeDefined();
    expect(clusterInclude.attributes).toEqual(
      expect.arrayContaining(['articleCount', 'sourceDiversityScore', 'sourceCount'])
    );
  });

  it('includes cluster association in smartFolderSearch mode when sort:IMPORTANCE is requested', async () => {
    await searchArticles({
      userId: 1,
      search: 'sort:IMPORTANCE',
      status: '%',
      smartFolderSearch: true
    });

    expect(Article.findAll).toHaveBeenCalledTimes(1);
    const query = Article.findAll.mock.calls[0][0];

    const clusterInclude = query.include.find(item => item.as === 'cluster');
    expect(clusterInclude).toBeDefined();
  });
});
