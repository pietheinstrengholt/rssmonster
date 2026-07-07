import { describe, expect, it } from 'vitest';
import createArticleDuplicateCache from '../services/crawl/articleDuplicateCache.js';

describe('article duplicate cache', () => {
  it('finds feed URL and title duplicates plus user-wide content hash duplicates', () => {
    const userContentHashIds = new Map([['other-feed-hash', 9]]);
    const cache = createArticleDuplicateCache(
      [
        {
          id: 1,
          url: 'https://example.com/article',
          title: 'Existing article',
          contentHash: 'feed-hash'
        }
      ],
      userContentHashIds
    );

    expect(cache.find(null, 'https://example.com/article', null)).toEqual({ id: 1 });
    expect(cache.find('Existing article', null, null)).toEqual({ id: 1 });
    expect(cache.find(null, null, 'other-feed-hash')).toEqual({ id: 9 });
    expect(cache.find('New article', 'https://example.com/new', 'new-hash')).toBeNull();
  });

  it('indexes articles saved during the current feed crawl', () => {
    const cache = createArticleDuplicateCache();

    cache.add({
      id: 2,
      url: 'https://example.com/new',
      title: 'New article',
      contentHash: 'new-hash'
    });

    expect(cache.find(null, null, 'new-hash')).toEqual({ id: 2 });
    expect(cache.find(null, 'https://example.com/new', null)).toEqual({ id: 2 });
    expect(cache.find('New article', null, null)).toEqual({ id: 2 });
  });
});
