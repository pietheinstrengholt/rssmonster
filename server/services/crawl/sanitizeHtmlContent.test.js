import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import sanitizeHtmlContent from './sanitizeHtmlContent.js';

describe('sanitizeHtmlContent publisher cards', () => {
  it('preserves canonical card content and classes on their intended elements', () => {
    const sanitized = sanitizeHtmlContent(
      '<figure class="rss-content-card rss-content-card--ghost">' +
      '<a class="rss-content-card__link" href="https://example.com/story">' +
      '<div class="rss-content-card__body">' +
      '<strong class="rss-content-card__title">Title</strong>' +
      '<p class="rss-content-card__description">Description</p>' +
      '<span class="rss-content-card__meta">Publisher</span>' +
      '</div><img class="rss-content-card__image" src="https://example.com/image.jpg" alt="" loading="lazy">' +
      '</a></figure>'
    );

    expect(sanitized).toBe(
      '<figure class="rss-content-card rss-content-card--ghost">' +
      '<a class="rss-content-card__link" href="https://example.com/story">' +
      '<div class="rss-content-card__body">' +
      '<strong class="rss-content-card__title">Title</strong>' +
      '<p class="rss-content-card__description">Description</p>' +
      '<span class="rss-content-card__meta">Publisher</span>' +
      '</div><img class="rss-content-card__image" src="https://example.com/image.jpg" alt="" loading="lazy" />' +
      '</a></figure>'
    );
  });

  it('removes unknown publisher classes and misplaced canonical classes', () => {
    const sanitized = sanitizeHtmlContent(
      '<figure class="kg-bookmark-card unknown rss-content-card__link">Card</figure>' +
      '<div class="twitter-tweet rss-content-card--twitter">Tweet</div>'
    );

    expect(sanitized).toBe('<figure>Card</figure><div>Tweet</div>');
  });

  it('removes unsafe and protocol-relative card URLs', () => {
    const sanitized = sanitizeHtmlContent(
      '<a class="rss-content-card__link" href="javascript:alert(1)">Unsafe</a>' +
      '<a class="rss-content-card__link" href="//example.com/story">Relative</a>' +
      '<img class="rss-content-card__image" src="//example.com/image.jpg">'
    );
    const $ = load(sanitized);

    expect($('a')).toHaveLength(2);
    expect($('a[href], img[src]')).toHaveLength(0);
    expect(sanitized).not.toMatch(/javascript:|\/\/example\.com/);
  });

  it('removes widget code and unsafe attributes while hardening blank links', () => {
    const sanitized = sanitizeHtmlContent(
      '<figure class="rss-content-card rss-content-card--instagram" ' +
      'style="width:100%" onclick="alert(1)" data-widget="instagram">' +
      '<a class="rss-content-card__link" href="https://instagram.com/p/ABC/" target="_blank">Post</a>' +
      '<script>alert(1)</script><iframe src="https://instagram.com/embed"></iframe>' +
      '</figure>'
    );
    const $ = load(sanitized);

    expect($('figure').attr('class')).toBe('rss-content-card rss-content-card--instagram');
    expect($('a').attr('rel')).toBe('noopener noreferrer');
    expect(sanitized).not.toMatch(/style=|onclick=|data-widget|<script|<iframe/);
  });
});
