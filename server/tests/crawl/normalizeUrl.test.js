import { describe, expect, it } from 'vitest';
import normalizeUrl from '../../services/crawl/normalizeUrl.js';

describe('normalizeUrl', () => {
  it('normalizes identity noise while preserving meaningful query params', () => {
    const normalized = normalizeUrl(
      'HTTPS://Example.COM:443/path/?id=123&utm_source=rss&fbclid=abc&mc_cide=def#comments'
    );

    expect(normalized).toBe('https://example.com/path?id=123');
  });

  it('does not strip non-tracking query params', () => {
    expect(normalizeUrl('https://example.com/search?q=rss&page=2')).toBe(
      'https://example.com/search?q=rss&page=2'
    );
  });

  it('returns invalid URLs unchanged', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});
