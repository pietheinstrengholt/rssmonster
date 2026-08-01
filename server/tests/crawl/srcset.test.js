import { describe, expect, it } from 'vitest';

import {
  normalizeSrcset,
  parseSrcset,
  selectBestSrcsetCandidate,
  serializeSrcset
} from '../../services/crawl/content/srcset.js';

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

  it('prefers the largest width when descriptor families are mixed', () => {
    const candidate = selectBestSrcsetCandidate(
      '/narrow.jpg 1w, /dense.jpg 3x, /wide.jpg 2w',
      'https://example.com/story'
    );

    expect(candidate).toMatchObject({
      url: 'https://example.com/wide.jpg',
      descriptor: '2w',
      width: 2
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

  // Parses descriptor-free candidates, leading separators, and decimal densities.
  it('parses separator and descriptor edge cases', () => {
    expect(parseSrcset(' , /plain.jpg,,  /half.jpg .5x, /one.jpg 1.0x')).toEqual([
      { url: '/plain.jpg', descriptor: '' },
      { url: '/half.jpg', descriptor: '.5x' },
      { url: '/one.jpg', descriptor: '1.0x' }
    ]);
    expect(parseSrcset('')).toEqual([]);
    expect(parseSrcset(null)).toEqual([]);
  });

  // Drops incomplete candidate objects and invalid URL or descriptor values during serialization.
  it('serializes only complete valid candidates', () => {
    expect(serializeSrcset()).toBe('');
    expect(serializeSrcset([
      null,
      { url: '' },
      { url: 'http://[', descriptor: '1x' },
      { url: '/invalid.jpg', descriptor: '0x' },
      { url: 'https://example.com/plain.jpg' }
    ])).toBe('https://example.com/plain.jpg');
  });

  // Returns no normalized value when candidates cannot resolve to HTTP(S) URLs.
  it.each([
    ['//cdn.example.com/image.jpg 1x', null],
    ['/relative.jpg 1x', null],
    ['mailto:editor@example.com 1x', 'https://example.com/story'],
    ['http://[ 1x', 'https://example.com/story']
  ])('rejects unresolved srcset candidate %#', (value, baseUrl) => {
    expect(normalizeSrcset(value, baseUrl)).toBeNull();
  });

  // Accepts a URL object as the canonical base for relative candidates.
  it('normalizes against a URL base object', () => {
    expect(normalizeSrcset(
      'image.jpg 1x',
      new URL('https://example.com/articles/')
    )).toBe('https://example.com/articles/image.jpg 1x');
  });

  // Falls back to descriptor-free candidates and preserves source order on score ties.
  it('selects stable descriptor-free candidates', () => {
    expect(selectBestSrcsetCandidate(
      '/first.jpg, /second.jpg',
      'https://example.com/story'
    )).toMatchObject({
      url: 'https://example.com/first.jpg',
      width: null,
      density: null,
      score: 0,
      index: 0
    });
    expect(selectBestSrcsetCandidate('', 'https://example.com/story')).toBeNull();
  });
});
