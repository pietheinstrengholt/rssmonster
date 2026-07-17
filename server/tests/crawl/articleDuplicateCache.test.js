import { describe, expect, it } from 'vitest';
import createArticleDuplicateCache, {
  addSharedUserArticleHashes,
  createSharedUserArticleHashIds
} from '../../services/crawl/identity/articleDuplicateCache.js';

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
          publishedAt: '2026-07-01T00:00:00.000Z',
          contentTextHash: 'feed-stripped-hash',
          contentSourceHash: 'feed-hash'
        }
      ],
      userArticleHashIds
    );

    expect(cache.findByFeedUrlHash('url-hash')).toEqual({ id: 1 });
    expect(cache.findByFeedNormalizedUrlHash('normalized-url-hash')).toEqual({ id: 1 });
    expect(cache.findFeedTitleCandidates('  existing ARTICLE  ')).toEqual([
      { id: 1, publishedAt: '2026-07-01T00:00:00.000Z' }
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
      publishedAt: '2026-07-02T00:00:00.000Z',
      contentTextHash: 'new-stripped-hash',
      contentSourceHash: 'new-hash'
    });

    expect(cache.findByUserContentTextHash('new-stripped-hash')).toEqual({ id: 2 });
    expect(cache.findByUserContentSourceHash('new-hash')).toEqual({ id: 2 });
    expect(cache.findByFeedUrlHash('new-url-hash')).toEqual({ id: 2 });
    expect(cache.findByFeedNormalizedUrlHash('new-normalized-url-hash')).toEqual({ id: 2 });
    expect(cache.findFeedTitleCandidates('new ARTICLE')).toEqual([
      { id: 2, publishedAt: '2026-07-02T00:00:00.000Z' }
    ]);
  });

  it('keeps a newly saved filtered article out of active duplicate indexes', () => {
    const cache = createArticleDuplicateCache();

    cache.add({
      id: 13,
      filteredInd: true,
      urlHash: 'new-filtered-url-hash',
      title: 'New filtered article',
      publishedAt: '2026-07-02T00:00:00.000Z',
      contentTextHash: 'new-filtered-text-hash',
      contentSourceHash: 'new-filtered-source-hash'
    });

    expect(cache.findByFeedUrlHash('new-filtered-url-hash')).toEqual({ id: 13 });
    expect(cache.findByUserContentTextHash('new-filtered-text-hash')).toBeNull();
    expect(cache.findByUserContentSourceHash('new-filtered-source-hash')).toBeNull();
    expect(cache.findFeedTitleCandidates('New filtered article')).toEqual([]);
  });

  it('replaces stale identities and title candidates after an article update', () => {
    const previousArticle = {
      id: 3,
      urlHash: 'old-url-hash',
      normalizedUrlHash: 'old-normalized-url-hash',
      title: 'Old title',
      publishedAt: '2026-07-03T00:00:00.000Z',
      contentTextHash: 'old-text-hash',
      contentSourceHash: 'old-source-hash'
    };
    const cache = createArticleDuplicateCache([previousArticle]);
    const updatedArticle = {
      id: 3,
      urlHash: 'new-url-hash',
      normalizedUrlHash: 'new-normalized-url-hash',
      title: 'New title',
      publishedAt: '2026-07-04T00:00:00.000Z',
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
      { id: 3, publishedAt: '2026-07-04T00:00:00.000Z' }
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

  it('keeps filtered URL identities but excludes filtered content hashes and titles', () => {
    const cache = createArticleDuplicateCache([
      {
        id: 6,
        filteredInd: true,
        urlHash: 'filtered-url-hash',
        normalizedUrlHash: 'filtered-normalized-url-hash',
        title: 'Filtered article title',
        publishedAt: '2026-07-05T00:00:00.000Z',
        contentTextHash: 'filtered-text-hash',
        contentSourceHash: 'filtered-source-hash'
      },
      {
        id: 7,
        filteredInd: false,
        title: 'Active article title',
        publishedAt: '2026-07-05T00:00:00.000Z',
        contentTextHash: 'active-text-hash',
        contentSourceHash: 'active-source-hash'
      }
    ]);

    expect(cache.findByFeedUrlHash('filtered-url-hash')).toEqual({ id: 6 });
    expect(cache.findByFeedNormalizedUrlHash('filtered-normalized-url-hash')).toEqual({ id: 6 });
    expect(cache.findByUserContentTextHash('filtered-text-hash')).toBeNull();
    expect(cache.findByUserContentSourceHash('filtered-source-hash')).toBeNull();
    expect(cache.findFeedTitleCandidates('Filtered article title')).toEqual([]);
    expect(cache.findByUserContentTextHash('active-text-hash')).toEqual({ id: 7 });
    expect(cache.findByUserContentSourceHash('active-source-hash')).toEqual({ id: 7 });
    expect(cache.findFeedTitleCandidates('Active article title')).toEqual([
      { id: 7, publishedAt: '2026-07-05T00:00:00.000Z' }
    ]);
  });

  it('does not seed shared user content indexes with filtered articles', () => {
    const sharedUserArticleHashIds = createSharedUserArticleHashIds();

    addSharedUserArticleHashes(sharedUserArticleHashIds, {
      id: 8,
      filteredInd: true,
      contentTextHash: 'filtered-shared-text-hash',
      contentSourceHash: 'filtered-shared-source-hash'
    });
    addSharedUserArticleHashes(sharedUserArticleHashIds, {
      id: 9,
      filteredInd: false,
      contentTextHash: 'active-shared-text-hash',
      contentSourceHash: 'active-shared-source-hash'
    });

    expect(sharedUserArticleHashIds.contentTextHashIds.has('filtered-shared-text-hash')).toBe(false);
    expect(sharedUserArticleHashIds.contentSourceHashIds.has('filtered-shared-source-hash')).toBe(false);
    expect(sharedUserArticleHashIds.contentTextHashIds.get('active-shared-text-hash')).toBe(9);
    expect(sharedUserArticleHashIds.contentSourceHashIds.get('active-shared-source-hash')).toBe(9);
  });

  it('keeps shared duplicate hashes isolated between users', () => {
    const userAHashIds = createSharedUserArticleHashIds();
    const userBHashIds = createSharedUserArticleHashIds();
    const userACache = createArticleDuplicateCache([], userAHashIds);
    const userBCache = createArticleDuplicateCache([], userBHashIds);

    addSharedUserArticleHashes(userAHashIds, {
      id: 14,
      filteredInd: true,
      contentTextHash: 'cross-user-text-hash'
    });
    addSharedUserArticleHashes(userBHashIds, {
      id: 15,
      filteredInd: false,
      contentTextHash: 'cross-user-text-hash'
    });

    expect(userACache.findByUserContentTextHash('cross-user-text-hash')).toBeNull();
    expect(userBCache.findByUserContentTextHash('cross-user-text-hash')).toEqual({ id: 15 });
  });

  it('removes active duplicate identities when an article becomes filtered', () => {
    const previousArticle = {
      id: 10,
      filteredInd: false,
      urlHash: 'transition-url-hash',
      title: 'Transition article title',
      publishedAt: '2026-07-06T00:00:00.000Z',
      contentTextHash: 'transition-text-hash',
      contentSourceHash: 'transition-source-hash'
    };
    const cache = createArticleDuplicateCache([previousArticle]);

    cache.update(previousArticle, {
      ...previousArticle,
      filteredInd: true
    });

    expect(cache.findByFeedUrlHash('transition-url-hash')).toEqual({ id: 10 });
    expect(cache.findByUserContentTextHash('transition-text-hash')).toBeNull();
    expect(cache.findByUserContentSourceHash('transition-source-hash')).toBeNull();
    expect(cache.findFeedTitleCandidates('Transition article title')).toEqual([]);
  });

  it('adds current duplicate identities when a filtered article becomes active', () => {
    const previousArticle = {
      id: 11,
      filteredInd: true,
      urlHash: 'reactivated-url-hash',
      title: 'Previously filtered article',
      publishedAt: '2026-07-07T00:00:00.000Z',
      contentTextHash: 'old-filtered-text-hash',
      contentSourceHash: 'old-filtered-source-hash'
    };
    const cache = createArticleDuplicateCache([previousArticle]);
    const updatedArticle = {
      ...previousArticle,
      filteredInd: false,
      title: 'Reactivated article title',
      contentTextHash: 'reactivated-text-hash',
      contentSourceHash: 'reactivated-source-hash'
    };

    cache.update(previousArticle, updatedArticle);

    expect(cache.findByUserContentTextHash('old-filtered-text-hash')).toBeNull();
    expect(cache.findByUserContentSourceHash('old-filtered-source-hash')).toBeNull();
    expect(cache.findByUserContentTextHash('reactivated-text-hash')).toEqual({ id: 11 });
    expect(cache.findByUserContentSourceHash('reactivated-source-hash')).toEqual({ id: 11 });
    expect(cache.findFeedTitleCandidates('Reactivated article title')).toEqual([
      { id: 11, publishedAt: '2026-07-07T00:00:00.000Z' }
    ]);
  });

  it('keeps changed filtered identities out of active duplicate indexes', () => {
    const previousArticle = {
      id: 12,
      filteredInd: true,
      title: 'Old filtered title',
      contentTextHash: 'old-filtered-text',
      contentSourceHash: 'old-filtered-source'
    };
    const cache = createArticleDuplicateCache([previousArticle]);

    cache.update(previousArticle, {
      id: 12,
      filteredInd: true,
      title: 'New filtered title',
      contentTextHash: 'new-filtered-text',
      contentSourceHash: 'new-filtered-source'
    });

    expect(cache.findByUserContentTextHash('new-filtered-text')).toBeNull();
    expect(cache.findByUserContentSourceHash('new-filtered-source')).toBeNull();
    expect(cache.findFeedTitleCandidates('New filtered title')).toEqual([]);
  });
});
