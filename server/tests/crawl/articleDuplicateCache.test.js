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

  it('replaces stale identities and title candidates after an article update', () => {
    const previousArticle = {
      id: 3,
      urlHash: 'old-url-hash',
      normalizedUrlHash: 'old-normalized-url-hash',
      title: 'Old title',
      published: '2026-07-03T00:00:00.000Z',
      contentTextHash: 'old-text-hash',
      contentSourceHash: 'old-source-hash'
    };
    const cache = createArticleDuplicateCache([previousArticle]);
    const updatedArticle = {
      id: 3,
      urlHash: 'new-url-hash',
      normalizedUrlHash: 'new-normalized-url-hash',
      title: 'New title',
      published: '2026-07-04T00:00:00.000Z',
      contentTextHash: 'new-text-hash',
      contentSourceHash: 'new-source-hash'
    };

    cache.update(previousArticle, updatedArticle);

    expect(cache.findByFeedUrlHash('old-url-hash')).toBeNull();
    expect(cache.findByFeedNormalizedUrlHash('old-normalized-url-hash')).toBeNull();
    expect(cache.findByUserContentTextHash('old-text-hash')).toBeNull();
    expect(cache.findByUserContentSourceHash('old-source-hash')).toBeNull();
    expect(cache.findFeedTitleCandidates('Old title')).toEqual([]);
    expect(cache.findByFeedUrlHash('new-url-hash')).toEqual({ id: 3 });
    expect(cache.findByFeedNormalizedUrlHash('new-normalized-url-hash')).toEqual({ id: 3 });
    expect(cache.findByUserContentTextHash('new-text-hash')).toEqual({ id: 3 });
    expect(cache.findByUserContentSourceHash('new-source-hash')).toEqual({ id: 3 });
    expect(cache.findFeedTitleCandidates('New title')).toEqual([
      { id: 3, published: '2026-07-04T00:00:00.000Z' }
    ]);
  });

  it('does not remove identities that have since been reassigned to another article', () => {
    const cache = createArticleDuplicateCache([
      {
        id: 4,
        urlHash: 'shared-url-hash',
        title: 'Updated article',
        contentTextHash: 'shared-text-hash'
      },
      {
        id: 5,
        urlHash: 'shared-url-hash',
        title: 'Other article',
        contentTextHash: 'shared-text-hash'
      }
    ]);

    cache.update(
      {
        id: 4,
        urlHash: 'shared-url-hash',
        title: 'Updated article',
        contentTextHash: 'shared-text-hash'
      },
      { id: 4, urlHash: 'replacement-url-hash', title: 'Replacement article' }
    );

    expect(cache.findByFeedUrlHash('shared-url-hash')).toEqual({ id: 5 });
    expect(cache.findByUserContentTextHash('shared-text-hash')).toEqual({ id: 5 });
    expect(cache.findFeedTitleCandidates('Updated article')).toEqual([]);
    expect(cache.findByFeedUrlHash('replacement-url-hash')).toEqual({ id: 4 });
  });
});
