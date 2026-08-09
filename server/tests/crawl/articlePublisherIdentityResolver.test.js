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

  it('never replaces a stable feed identity with a URL suffix', () => {
    expect(articleIdentityResolver({
      url: 'https://www.ad.nl/show/updated-headline~A53E042B/',
      externalId: 'https://www.ad.nl/show/old-headline~a53e042b/',
      externalIdType: 'guid'
    })).toEqual({
      externalId: 'https://www.ad.nl/show/old-headline~a53e042b/',
      externalIdType: 'guid'
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

  it('keeps distinct stable IDs distinct even when they share a URL', () => {
    const url = 'https://example.com/articles/shared';

    expect(articleIdentityResolver({ url, externalId: 'one', externalIdType: 'json-id' }))
      .toMatchObject({ externalId: 'one', externalIdType: 'json-id' });
    expect(articleIdentityResolver({ url, externalId: 'two', externalIdType: 'json-id' }))
      .toMatchObject({ externalId: 'two', externalIdType: 'json-id' });
  });

  it('keeps a stable ID when the canonical URL changes', () => {
    const identity = { externalId: 'tag:example.com,2026:story', externalIdType: 'atom-id' };

    expect(articleIdentityResolver({ ...identity, url: 'https://example.com/old-slug' }))
      .toEqual(identity);
    expect(articleIdentityResolver({ ...identity, url: 'https://example.com/new-slug' }))
      .toEqual(identity);
  });

  it('uses a complete canonical URL rather than its collision-prone suffix', () => {
    expect(articleIdentityResolver({
      url: 'https://news.example.com/first-story-92af41c7d8/?utm_source=feed'
    })).toEqual({
      externalId: 'https://news.example.com/first-story-92af41c7d8',
      externalIdType: 'normalized-url'
    });
  });

  it('uses a deterministic metadata hash only when ID and URL are unavailable', () => {
    const entry = { title: 'Offline item', publishedAt: '2026-08-09T10:00:00Z' };
    const first = articleIdentityResolver(entry);

    expect(first.externalIdType).toBe('metadata-hash');
    expect(first.externalId).toMatch(/^[a-f0-9]{64}$/);
    expect(articleIdentityResolver(entry)).toEqual(first);
  });
});
