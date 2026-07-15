import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import normalizeHtmlUrls from '../../services/crawl/content/normalizeHtmlUrls.js';

const BASE_URL = 'https://example.com/articles/current';

// This function normalizes a fragment and returns its mutable DOM.
function normalize(html, baseUrl = BASE_URL) {
  const $ = load(html, { xml: { xmlMode: false } }, false);
  normalizeHtmlUrls($, baseUrl);
  return $;
}

describe('normalizeHtmlUrls', () => {
  it('resolves a root-relative anchor URL', () => {
    const $ = normalize('<a href="/news/story">Story</a>');

    expect($.html()).toBe('<a href="https://example.com/news/story">Story</a>');
  });

  it('resolves path-relative anchor URLs with WHATWG URL behavior', () => {
    const $ = normalize('<a href="../related">Related</a><a href="story-two">Next</a>');

    expect($('a').toArray().map(el => $(el).attr('href'))).toEqual([
      'https://example.com/related',
      'https://example.com/articles/story-two'
    ]);
  });

  it('resolves a root-relative image URL', () => {
    const $ = normalize('<img src="/images/photo.jpg">');

    expect($('img').attr('src')).toBe('https://example.com/images/photo.jpg');
  });

  it('resolves a protocol-relative image URL using the base protocol', () => {
    const $ = normalize('<img src="//cdn.example.com/image.jpg">');

    expect($('img').attr('src')).toBe('https://cdn.example.com/image.jpg');
  });

  it('resolves a query-only URL against the current article path', () => {
    const $ = normalize('<a href="?page=2">Next page</a>');

    expect($('a').attr('href')).toBe('https://example.com/articles/current?page=2');
  });

  it('keeps a fragment-only anchor compact', () => {
    const $ = normalize('<a href="#comments">Comments</a><area href="#map">');

    expect($('a').attr('href')).toBe('#comments');
    expect($('area').attr('href')).toBeUndefined();
  });

  it('keeps an absolute HTTPS URL semantically unchanged', () => {
    const $ = normalize('<a href="https://other.example/story">Story</a>');

    expect($('a').attr('href')).toBe('https://other.example/story');
  });

  it('preserves mailto and tel links', () => {
    const $ = normalize(
      '<a href="mailto:reader@example.com">Email</a>' +
      '<area href="tel:+31201234567">Call</area>'
    );

    expect($('a').attr('href')).toBe('mailto:reader@example.com');
    expect($('area').attr('href')).toBe('tel:+31201234567');
  });

  it('removes unsafe URL schemes without removing their elements', () => {
    const $ = normalize(
      '<a href="javascript:alert(1)">Unsafe</a>' +
      '<img src="data:image/png;base64,AAAA">'
    );

    expect($('a')).toHaveLength(1);
    expect($('img')).toHaveLength(1);
    expect($('a').attr('href')).toBeUndefined();
    expect($('img').attr('src')).toBeUndefined();
  });

  it('removes unresolved relative URLs when the base is missing', () => {
    const $ = normalize(
      '<a href="relative-story">Relative</a>' +
      '<img src="//cdn.example.com/image.jpg">' +
      '<a href="https://other.example/story">Absolute</a>',
      null
    );

    expect($('a').first().attr('href')).toBeUndefined();
    expect($('img').attr('src')).toBeUndefined();
    expect($('a').last().attr('href')).toBe('https://other.example/story');
  });

  it('does not throw for a malformed base URL', () => {
    const $ = load('<a href="relative">Relative</a>', { xml: { xmlMode: false } }, false);

    expect(() => normalizeHtmlUrls($, 'http://[invalid')).not.toThrow();
    expect($('a').attr('href')).toBeUndefined();
  });

  it('normalizes video posters and source URLs', () => {
    const $ = normalize(
      '<video poster="/images/poster.jpg"><source src="../video/movie.mp4"></video>'
    );

    expect($('video').attr('poster')).toBe('https://example.com/images/poster.jpg');
    expect($('source').attr('src')).toBe('https://example.com/video/movie.mp4');
  });

  it('normalizes cite attributes', () => {
    const $ = normalize(
      '<blockquote cite="/sources/quote">Quote</blockquote>' +
      '<q cite="./inline">Inline</q><del cite="../old">Old</del><ins cite="/new">New</ins>'
    );

    expect($('[cite]').toArray().map(el => $(el).attr('cite'))).toEqual([
      'https://example.com/sources/quote',
      'https://example.com/articles/inline',
      'https://example.com/old',
      'https://example.com/new'
    ]);
  });

  it('normalizes the remaining supported media attributes', () => {
    const $ = normalize(
      '<img longdesc="./description"><video src="/movie.mp4"></video>' +
      '<audio src="../audio/show.mp3"></audio>'
    );

    expect($('img').attr('longdesc')).toBe('https://example.com/articles/description');
    expect($('video').attr('src')).toBe('https://example.com/movie.mp4');
    expect($('audio').attr('src')).toBe('https://example.com/audio/show.mp3');
  });

  it('normalizes img srcset candidates with width descriptors', () => {
    const $ = normalize('<img srcset="/small.jpg 480w, ../large.jpg 1200w">');

    expect($('img').attr('srcset')).toBe(
      'https://example.com/small.jpg 480w, https://example.com/large.jpg 1200w'
    );
  });

  it('normalizes source srcset candidates with density descriptors', () => {
    const $ = normalize('<source srcset="./image.jpg 1x, //cdn.example.com/image.jpg 2x">');

    expect($('source').attr('srcset')).toBe(
      'https://example.com/articles/image.jpg 1x, https://cdn.example.com/image.jpg 2x'
    );
  });

  it('drops invalid srcset candidates while preserving valid candidates', () => {
    const $ = normalize(
      '<img srcset="javascript:alert(1) 1x, /valid.jpg 2x, /bad.jpg invalid">'
    );

    expect($('img').attr('srcset')).toBe('https://example.com/valid.jpg 2x');
  });

  it('removes srcset when no valid candidates remain', () => {
    const $ = normalize('<img srcset="data:image/png;base64,AAAA 1x, javascript:bad 2x">');

    expect($('img').attr('srcset')).toBeUndefined();
  });

  it('keeps data URL commas inside one rejected srcset candidate', () => {
    const $ = normalize(
      '<img srcset="data:image/svg+xml,%3Csvg%3E 1x, /safe.jpg 2x">'
    );

    expect($('img').attr('srcset')).toBe('https://example.com/safe.jpg 2x');
  });
});
