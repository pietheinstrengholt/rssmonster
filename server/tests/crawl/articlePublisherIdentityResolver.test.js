import { describe, expect, it } from 'vitest';

import articleIdentityResolver, {
  resolvePublisherUrlIdentity
} from '../../services/crawl/extraction/articleIdentityResolver.js';

describe('publisher URL article identity resolver', () => {
  it('extracts a shared tilde hash suffix across revised URLs', () => {
    const firstUrl = 'https://www.ad.nl/binnenland/dennis-slaat-alarm~aab98e6d/';
    const revisedUrl = 'https://www.ad.nl/binnenland/webshopkenner-dennis-waarschuwt~aab98e6d/';

    expect(resolvePublisherUrlIdentity(firstUrl)).toEqual({
      externalId: 'aab98e6d',
      externalIdType: 'url-suffix-hash'
    });
    expect(resolvePublisherUrlIdentity(revisedUrl)).toEqual({
      externalId: 'aab98e6d',
      externalIdType: 'url-suffix-hash'
    });
  });

  it('extracts a dash-delimited hash suffix from another provider', () => {
    expect(resolvePublisherUrlIdentity(
      'https://news.example.com/world/revised-story-92af41c7d8/'
    )).toEqual({
      externalId: '92af41c7d8',
      externalIdType: 'url-suffix-hash'
    });
  });

  it('prefers stable URL suffix identity over a changing feed identity', () => {
    expect(articleIdentityResolver({
      url: 'https://www.ad.nl/show/updated-headline~A53E042B/',
      externalId: 'https://www.ad.nl/show/old-headline~a53e042b/',
      externalIdType: 'guid'
    })).toEqual({
      externalId: 'a53e042b',
      externalIdType: 'url-suffix-hash'
    });
  });

  it('does not infer identity from readable or numeric URL suffixes', () => {
    expect(resolvePublisherUrlIdentity('https://example.com/articles/latest-news')).toBeNull();
    expect(resolvePublisherUrlIdentity('https://example.com/articles/story-20260722')).toBeNull();
  });

  it('preserves adapter-provided identity when no supported URL pattern matches', () => {
    expect(articleIdentityResolver({
      url: 'https://example.com/articles/story',
      externalId: 'publisher-guid',
      externalIdType: 'guid'
    })).toEqual({
      externalId: 'publisher-guid',
      externalIdType: 'guid'
    });
  });
});
