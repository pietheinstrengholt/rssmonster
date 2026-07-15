import { describe, expect, it } from 'vitest';

import {
  normalizeSrcset,
  parseSrcset,
  selectBestSrcsetCandidate,
  serializeSrcset
} from '../../services/crawl/srcset.js';

describe('srcset utility', () => {
  it('resolves relative URLs against the article URL', () => {
    expect(normalizeSrcset(
      '/small.jpg 480w, ../large.jpg 2x',
      'https://example.com/articles/story'
    )).toBe(
      'https://example.com/small.jpg 480w, https://example.com/large.jpg 2x'
    );
  });

  it('rejects malformed candidates and non-HTTP(S) URLs', () => {
    expect(parseSrcset(
      'javascript:alert(1) 1x, /bad.jpg invalid, /zero.jpg 0w, /safe.jpg 2x'
    )).toEqual([
      { url: '/safe.jpg', descriptor: '2x' }
    ]);
  });

  it('preserves width descriptors when serializing candidates', () => {
    const candidates = parseSrcset('/small.jpg 480w, /large.jpg 1200w');

    expect(serializeSrcset(candidates)).toBe('/small.jpg 480w, /large.jpg 1200w');
  });

  it('preserves density descriptors and selects the strongest candidate', () => {
    const candidate = selectBestSrcsetCandidate(
      '/image.jpg 1x, /image@2x.jpg 2x',
      'https://example.com/story'
    );

    expect(candidate).toMatchObject({
      url: 'https://example.com/image@2x.jpg',
      descriptor: '2x',
      density: 2
    });
  });

  it('keeps commas inside candidate URLs', () => {
    expect(normalizeSrcset(
      '/image,small.jpg 1x, /image,large.jpg 2x',
      'https://example.com/story'
    )).toBe(
      'https://example.com/image,small.jpg 1x, https://example.com/image,large.jpg 2x'
    );
  });
});
