import { describe, expect, it } from 'vitest';
import {
  buildFeedUrlIdentity,
  normalizeFeedIdentityUrl
} from '../../services/feeds/feedUrlIdentity.js';

describe('feed URL comparison identity', () => {
  it('normalizes only conservative platform and unreserved URL variations', () => {
    expect(normalizeFeedIdentityUrl(
      'HTTPS://B\u00dcCHER.Example:443/a/./b/../%7efe%65d.xml#latest'
    )).toBe('https://xn--bcher-kva.example/a/~feed.xml');
    expect(normalizeFeedIdentityUrl(
      'https://xn--bcher-kva.example/a/~feed.xml'
    )).toBe('https://xn--bcher-kva.example/a/~feed.xml');
  });

  it('preserves case-sensitive paths and meaningful query distinctions', () => {
    expect(normalizeFeedIdentityUrl('https://example.com/Feed.xml')).not.toBe(
      normalizeFeedIdentityUrl('https://example.com/feed.xml')
    );
    expect(normalizeFeedIdentityUrl('https://example.com/feed?a=1&b=2')).not.toBe(
      normalizeFeedIdentityUrl('https://example.com/feed?b=2&a=1')
    );
    expect(normalizeFeedIdentityUrl('https://example.com/feed?view=Full')).not.toBe(
      normalizeFeedIdentityUrl('https://example.com/feed?view=full')
    );
  });

  it('does not equate schemes, www hosts, or reserved percent escapes', () => {
    expect(normalizeFeedIdentityUrl('http://example.com/feed')).not.toBe(
      normalizeFeedIdentityUrl('https://example.com/feed')
    );
    expect(normalizeFeedIdentityUrl('https://www.example.com/feed')).not.toBe(
      normalizeFeedIdentityUrl('https://example.com/feed')
    );
    expect(normalizeFeedIdentityUrl('https://example.com/a%2fb')).not.toBe(
      normalizeFeedIdentityUrl('https://example.com/a/b')
    );
  });

  it('creates stable fixed-width lookup hashes', () => {
    const first = buildFeedUrlIdentity('https://EXAMPLE.com:443/feed#one');
    const second = buildFeedUrlIdentity('https://example.com/feed#two');

    expect(first).toEqual(second);
    expect(first.normalizedUrlHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    'not a URL',
    'ftp://example.com/feed',
    'https://user:secret@example.com/feed'
  ])('rejects unsupported identity input %s', input => {
    expect(() => normalizeFeedIdentityUrl(input)).toThrow(TypeError);
  });
});
