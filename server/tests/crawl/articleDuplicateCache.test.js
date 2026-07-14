import { describe, expect, it } from 'vitest';
import createArticleDuplicateCache, { createSharedUserArticleHashIds } from '../../services/crawl/articleDuplicateCache.js';

describe('article duplicate cache', () => {
  it('looks up feed URL hashes and title candidates plus user-wide content hashes', () => {
    const userArticleHashIds = createSharedUserArticleHashIds();
    userArticleHashIds.contentTextHashIds.set('other-feed-stripped-hash', 8);
    userArticleHashIds.contentSourceHashIds.set('other-feed-hash', 9);

    const cache = createArticleDuplicateCache(
      [
        {
          id: 1,
          urlHash: 'url-hash',
          normalizedUrlHash: 'normalized-url-hash',
          title: 'Existing article',
          published: '2026-07-01T00:00:00.000Z',
          contentTextHash: 'feed-stripped-hash',
          contentSourceHash: 'feed-hash'
        }
      ],
      userArticleHashIds
    );

    expect(cache.findByFeedUrlHash('url-hash')).toEqual({ id: 1 });
    expect(cache.findByFeedNormalizedUrlHash('normalized-url-hash')).toEqual({ id: 1 });
    expect(cache.findFeedTitleCandidates('  existing ARTICLE  ')).toEqual([
      { id: 1, published: '2026-07-01T00:00:00.000Z' }
    ]);
    expect(cache.findByUserContentTextHash('other-feed-stripped-hash')).toEqual({ id: 8 });
    expect(cache.findByUserContentSourceHash('other-feed-hash')).toEqual({ id: 9 });
    expect(cache.findByUserContentSourceHash('new-hash')).toBeNull();
  });

  it('indexes articles saved during the current feed crawl', () => {
    const cache = createArticleDuplicateCache();

    cache.add({
      id: 2,
      urlHash: 'new-url-hash',
      normalizedUrlHash: 'new-normalized-url-hash',
      title: 'New article',
      published: '2026-07-02T00:00:00.000Z',
      contentTextHash: 'new-stripped-hash',
      contentSourceHash: 'new-hash'
    });

    expect(cache.findByUserContentTextHash('new-stripped-hash')).toEqual({ id: 2 });
    expect(cache.findByUserContentSourceHash('new-hash')).toEqual({ id: 2 });
    expect(cache.findByFeedUrlHash('new-url-hash')).toEqual({ id: 2 });
    expect(cache.findByFeedNormalizedUrlHash('new-normalized-url-hash')).toEqual({ id: 2 });
    expect(cache.findFeedTitleCandidates('new ARTICLE')).toEqual([
      { id: 2, published: '2026-07-02T00:00:00.000Z' }
    ]);
  });
});
