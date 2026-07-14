import { describe, expect, it } from 'vitest';
import createHotlinkCountCache from '../../services/crawl/hotlinkCountCache.js';

describe('hotlink count cache', () => {
  it('counts normalized URLs and query-suffixed hotlinks from other feeds', () => {
    const cache = createHotlinkCountCache([
      { feedId: 1, url: 'https://example.com/article' },
      { feedId: 2, url: 'https://example.com/article?utm_source=rss' },
      { feedId: 3, url: 'https://example.com/article?ref=related' },
      { feedId: 4, url: 'https://example.com/other' }
    ]);

    expect(cache.count('https://example.com/article?utm_campaign=feed', 1)).toBe(1);
    expect(cache.count('https://example.com/article/', 2)).toBe(1);
    expect(cache.count('https://example.com/article?ref=related', 1)).toBe(1);
    expect(cache.count('https://example.com/other', 4)).toBe(0);
  });

  it('indexes hotlinks added during a crawl', () => {
    const cache = createHotlinkCountCache();

    cache.add({ feedId: 2, url: 'https://example.com/article?utm_source=feed' });

    expect(cache.count('https://example.com/article', 1)).toBe(1);
  });
});
