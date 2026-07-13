import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import cleanupHtmlContent from './cleanupHtmlContent.js';
import normalizePublisherCards from './normalizePublisherCards.js';

// This function loads publisher fragments without parser-driven card repair.
function loadFragment(html) {
  return load(html, { xml: { xmlMode: false } }, false);
}

// This function runs the publisher normalizer directly and returns its fragment DOM.
function normalize(html) {
  const $ = loadFragment(html);
  normalizePublisherCards($);
  return $;
}

// This function runs the full structural cleanup used before sanitization.
function cleanup(html) {
  const $ = loadFragment(html);
  cleanupHtmlContent($);
  return $;
}

describe('normalizePublisherCards', () => {
  it('normalizes a complete Ghost bookmark', () => {
    const $ = normalize(
      '<figure class="kg-card kg-bookmark-card">' +
      '<a class="kg-bookmark-container" href="https://example.com/story">' +
      '<div class="kg-bookmark-content">' +
      '<div class="kg-bookmark-title">Story title</div>' +
      '<div class="kg-bookmark-description">Story description</div>' +
      '<div class="kg-bookmark-metadata"><span class="kg-bookmark-publisher">Example News</span></div>' +
      '</div>' +
      '<div class="kg-bookmark-thumbnail"><img src="https://example.com/image.jpg"></div>' +
      '</a></figure>'
    );

    expect($.html()).toBe(
      '<figure class="rss-content-card rss-content-card--ghost">' +
      '<a class="rss-content-card__link" href="https://example.com/story">' +
      '<div class="rss-content-card__body">' +
      '<strong class="rss-content-card__title">Story title</strong>' +
      '<p class="rss-content-card__description">Story description</p>' +
      '<span class="rss-content-card__meta">Example News</span>' +
      '</div>' +
      '<img class="rss-content-card__image" src="https://example.com/image.jpg" alt loading="lazy">' +
      '</a></figure>'
    );
  });

  it('normalizes a Ghost bookmark without adding an empty image', () => {
    const $ = normalize(
      '<div class="kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.com/story">' +
      '<div class="kg-bookmark-title">Text-only story</div></a></div>'
    );

    expect($('.rss-content-card--ghost')).toHaveLength(1);
    expect($('.rss-content-card__title').text()).toBe('Text-only story');
    expect($('.rss-content-card__image')).toHaveLength(0);
  });

  it('leaves a malformed Ghost bookmark without a safe link unchanged', () => {
    const source = '<figure class="kg-bookmark-card"><a href="javascript:alert(1)">' +
      '<div class="kg-bookmark-title">Unsafe story</div></a></figure>';
    const $ = normalize(source);

    expect($.html()).toBe(source);
    expect($('.rss-content-card')).toHaveLength(0);
  });

  it('does not process a canonical Ghost card twice', () => {
    const $ = normalize(
      '<figure class="kg-bookmark-card"><a href="https://example.com/story">' +
      '<div class="kg-bookmark-title">Story</div></a></figure>'
    );

    normalizePublisherCards($);
    const secondNormalization = $.html();
    normalizePublisherCards($);

    expect($.html()).toBe(secondNormalization);
    expect($('.rss-content-card')).toHaveLength(1);
  });

  it('does not replace a publisher wrapper that already contains a canonical card', () => {
    const source = '<div class="kg-bookmark-card">' +
      '<figure class="rss-content-card rss-content-card--ghost">' +
      '<a class="rss-content-card__link" href="https://example.com/story">Story</a>' +
      '</figure></div>';
    const $ = normalize(source);

    expect($.html()).toBe(source);
    expect($('.rss-content-card')).toHaveLength(1);
  });

  it('normalizes a standard WordPress embed and drops widget placeholders', () => {
    const $ = cleanup(
      '<figure class="wp-block-embed"><div class="wp-block-embed__wrapper">' +
      '<blockquote class="wp-embedded-content"><a href="https://example.com/article">Article title</a></blockquote>' +
      '<div class="wp-embed-site-title">Example Publisher</div>' +
      '<img src="https://example.com/cover.jpg"><iframe src="https://example.com/embed"></iframe>' +
      '<script src="https://example.com/embed.js"></script>' +
      '</div></figure>'
    );

    expect($('.rss-content-card--wordpress')).toHaveLength(1);
    expect($('.rss-content-card__title').text()).toBe('Article title');
    expect($('.rss-content-card__meta').text()).toBe('Example Publisher');
    expect($('.rss-content-card__image').attr('src')).toBe('https://example.com/cover.jpg');
    expect($('script, iframe')).toHaveLength(0);
  });

  it('normalizes a WordPress embedded-content blockquote', () => {
    const $ = normalize(
      '<blockquote class="wp-embedded-content"><a href="https://example.com/article">' +
      'Embedded article</a></blockquote>'
    );

    expect($('.rss-content-card--wordpress')).toHaveLength(1);
    expect($('.rss-content-card__link').attr('href')).toBe('https://example.com/article');
    expect($('.rss-content-card__title').text()).toBe('Embedded article');
  });

  it('does not convert an ordinary WordPress-linked blockquote', () => {
    const source = '<blockquote><a href="https://wordpress.com/post">Ordinary quotation</a></blockquote>';
    const $ = normalize(source);

    expect($.html()).toBe(source);
    expect($('.rss-content-card')).toHaveLength(0);
  });

  it('normalizes a Twitter status card and removes widget attributes', () => {
    const $ = normalize(
      '<blockquote class="twitter-tweet extra" data-theme="dark" style="width: 500px">' +
      '<p>Readable post text</p>— Ada (@ada) ' +
      '<a href="https://twitter.com/ada/status/123">June 1, 2026</a>' +
      '<script src="https://platform.twitter.com/widgets.js"></script>' +
      '</blockquote>'
    );

    expect($('.rss-content-card--twitter')).toHaveLength(1);
    expect($('.rss-content-card__title').text()).toBe('Ada (@ada)');
    expect($('.rss-content-card__description').text()).toBe('Readable post text');
    expect($('.rss-content-card__link').attr('href')).toBe('https://twitter.com/ada/status/123');
    expect($.html()).not.toMatch(/data-theme|style=|<script|twitter-tweet/);
  });

  it('normalizes an X status card', () => {
    const $ = normalize(
      '<blockquote class="twitter-tweet"><p>An X post</p>' +
      '<a href="https://x.com/example/status/456">Status</a></blockquote>'
    );

    expect($('.rss-content-card--twitter')).toHaveLength(1);
    expect($('.rss-content-card__link').attr('href')).toBe('https://x.com/example/status/456');
    expect($('.rss-content-card__description').text()).toBe('An X post');
  });

  it('does not convert an arbitrary blockquote linking to X', () => {
    const source = '<blockquote><a href="https://x.com/example/status/456">Quoted source</a></blockquote>';
    const $ = normalize(source);

    expect($.html()).toBe(source);
    expect($('.rss-content-card')).toHaveLength(0);
  });

  it('normalizes an Instagram post card and removes repeated fallback text', () => {
    const $ = normalize(
      '<blockquote class="instagram-media" data-instgrm-permalink="ignored" style="width: 100%">' +
      '<cite>Grace (@grace)</cite><p>A useful caption</p>' +
      '<p>View this post on Instagram</p><p>View this post on Instagram</p>' +
      '<a href="https://www.instagram.com/p/ABC123/">View this post on Instagram</a>' +
      '</blockquote>'
    );

    expect($('.rss-content-card--instagram')).toHaveLength(1);
    expect($('.rss-content-card__title').text()).toBe('Grace (@grace)');
    expect($('.rss-content-card__description').text()).toBe('A useful caption');
    expect($('.rss-content-card__link').attr('href')).toBe('https://www.instagram.com/p/ABC123/');
    expect($.html()).not.toMatch(/View this post on Instagram|data-instgrm|style=/i);
  });

  it('normalizes Instagram reel and reels URLs', () => {
    const $ = normalize(
      '<blockquote class="instagram-media"><p>First reel</p>' +
      '<a href="https://instagram.com/reel/REEL1/">Reel</a></blockquote>' +
      '<blockquote class="instagram-media"><p>Second reel</p>' +
      '<a href="https://instagram.com/reels/REEL2/">Reels</a></blockquote>'
    );

    expect($('.rss-content-card--instagram')).toHaveLength(2);
    expect($('.rss-content-card__link').toArray().map(el => $(el).attr('href'))).toEqual([
      'https://instagram.com/reel/REEL1/',
      'https://instagram.com/reels/REEL2/'
    ]);
  });

  it('does not convert an arbitrary blockquote linking to Instagram', () => {
    const source = '<blockquote><a href="https://instagram.com/p/ABC123/">Photo source</a></blockquote>';
    const $ = normalize(source);

    expect($.html()).toBe(source);
    expect($('.rss-content-card')).toHaveLength(0);
  });
});
