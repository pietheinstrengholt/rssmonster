import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import cleanupHtmlContent from '../../services/crawl/cleanupHtmlContent.js';
import processHtmlContent from '../../services/crawl/processHtmlContent.js';
import sanitizeHtmlContent from '../../services/crawl/sanitizeHtmlContent.js';
import { transformVimeoContent } from '../../services/crawl/compatibility/transformVimeoContent.js';

// This function loads a source fragment and applies only the Vimeo transformer.
function transform(source) {
  const $ = load(source);
  return {
    $,
    transformedCount: transformVimeoContent($)
  };
}

// This function returns the canonical Vimeo card from a transformed document.
function vimeoCard($) {
  return $('figure.rss-content-card--vimeo').first();
}

describe('transformVimeoContent URL recognition', () => {
  it.each([
    ['https://player.vimeo.com/video/123456789', '123456789'],
    ['https://vimeo.com/234567890', '234567890'],
    ['https://vimeo.com/video/345678901', '345678901'],
    ['https://www.vimeo.com/456789012', '456789012'],
    ['https://vimeo.com/567890123?share=copy', '567890123'],
    ['https://player.vimeo.com/video/678901234?h=abc#player', '678901234'],
    ['https://VIMEO.COM/789012345', '789012345'],
    ['http://www.VIMEO.com/video/890123456', '890123456']
  ])('accepts supported URL %s', (url, providerId) => {
    const { $, transformedCount } = transform(`<iframe src="${url}"></iframe>`);
    const card = vimeoCard($);

    expect(transformedCount).toBe(1);
    expect(card.attr('data-embed-id')).toBe(providerId);
    expect(card.attr('data-embed-url')).toBe(`https://vimeo.com/${providerId}`);
    expect(card.attr('data-embed-player-url')).toBe(
      `https://player.vimeo.com/video/${providerId}`
    );
  });

  it.each([
    'https://vimeo.com/not-numeric',
    'https://vimeo.com/channels/staffpicks/123456789',
    'https://vimeo.com/showcase/123456789',
    'https://vimeo.com/groups/example/videos/123456789',
    'https://vimeo.com/user123',
    'https://vimeo.com/123456789/extra',
    'not a url',
    'ftp://vimeo.com/123456789',
    'https://user:password@vimeo.com/123456789',
    'https://vimeo.com.attacker.example/123456789',
    'https://player-vimeo.com/video/123456789',
    'https://vime0.com/123456789'
  ])('rejects unsupported or unsafe URL %s', url => {
    const { $, transformedCount } = transform(`<iframe src="${url}"></iframe>`);

    expect(transformedCount).toBe(0);
    expect($('iframe')).toHaveLength(1);
    expect(vimeoCard($)).toHaveLength(0);
  });
});

describe('transformVimeoContent iframes', () => {
  it('replaces a supported iframe and derives a compact aspect ratio', () => {
    const { $, transformedCount } = transform(
      '<iframe src="https://player.vimeo.com/video/123456789?h=secret" ' +
      'width="640" height="360"></iframe>'
    );
    const card = vimeoCard($);

    expect(transformedCount).toBe(1);
    expect($('iframe')).toHaveLength(0);
    expect(card.attr('data-embed-aspect-ratio')).toBe('1.7778');
    expect(card.attr('data-embed-url')).toBe('https://vimeo.com/123456789');
    expect(card.attr('data-embed-player-url')).not.toMatch(/[?#]|autoplay/i);
    expect(card.text()).toBe('Watch on Vimeo');
  });

  it.each([
    ['100%', '360'],
    ['auto', '360'],
    ['0', '360'],
    ['640', '-1'],
    ['999999', '360'],
    ['640', undefined]
  ])('omits aspect ratio for dimensions %s by %s', (width, height) => {
    const widthAttr = width === undefined ? '' : ` width="${width}"`;
    const heightAttr = height === undefined ? '' : ` height="${height}"`;
    const { $ } = transform(
      `<iframe src="https://vimeo.com/123456789"${widthAttr}${heightAttr}></iframe>`
    );

    expect(vimeoCard($).attr('data-embed-aspect-ratio')).toBeUndefined();
  });

  it('discards all publisher iframe attributes and fallback content', () => {
    const { $ } = transform(
      '<iframe src="https://vimeo.com/123456789" width="640" height="360" ' +
      'style="color:red" class="publisher" id="video" allow="autoplay" sandbox ' +
      'srcdoc="unsafe" onload="alert(1)" data-token="secret">Fallback</iframe>'
    );
    const html = $.html();

    expect(html).not.toMatch(/publisher|color:red|id="video"|allow=|sandbox|srcdoc|onload|secret|Fallback/);
    expect(html).not.toMatch(/<iframe|<script|<video|<object|<embed/i);
  });

  it('leaves unknown and malformed iframes for generic removal', () => {
    const source =
      '<iframe src="https://video.example/embed/123"></iframe>' +
      '<iframe src="https://vimeo.com/not-a-video"></iframe>';
    const { $, transformedCount } = transform(source);

    expect(transformedCount).toBe(0);
    expect($('iframe')).toHaveLength(2);

    cleanupHtmlContent($);
    expect($('iframe')).toHaveLength(0);
  });

  it('transforms multiple Vimeo iframes independently', () => {
    const { $, transformedCount } = transform(
      '<iframe src="https://vimeo.com/111"></iframe>' +
      '<div><iframe src="https://player.vimeo.com/video/222"></iframe></div>'
    );

    expect(transformedCount).toBe(2);
    expect($('.rss-content-card--vimeo')).toHaveLength(2);
    expect($('iframe')).toHaveLength(0);
  });

  it('is byte-equivalent after a second transformation', () => {
    const { $ } = transform(
      '<div class="embed-vimeo"><iframe src="https://vimeo.com/123456789"></iframe></div>'
    );
    const once = $.html();

    expect(transformVimeoContent($)).toBe(0);
    expect($.html()).toBe(once);
  });
});

describe('transformVimeoContent embed links and wrappers', () => {
  it.each([
    '<figure class="wp-block-embed-vimeo"><div class="wp-block-embed__wrapper">https://vimeo.com/123456789</div></figure>',
    '<figure class="wp-block-embed"><div class="wp-block-embed__wrapper"><a href="https://vimeo.com/123456789">https://vimeo.com/123456789</a></div></figure>',
    '<div class="embed-vimeo"><a href="https://vimeo.com/video/123456789">https://vimeo.com/video/123456789</a></div>'
  ])('replaces the outer recognized embed wrapper once', source => {
    const { $, transformedCount } = transform(source);

    expect(transformedCount).toBe(1);
    expect($('.rss-content-card--vimeo')).toHaveLength(1);
    expect($('.wp-block-embed-vimeo, .wp-block-embed, .wp-block-embed__wrapper, .embed-vimeo')).toHaveLength(0);
  });

  it('transforms a Vimeo thumbnail-only anchor with an explicit Vimeo label', () => {
    const { $, transformedCount } = transform(
      '<a href="https://vimeo.com/123456789"><img src="thumb.jpg" alt="Vimeo video"></a>'
    );

    expect(transformedCount).toBe(1);
    expect($('.rss-content-card--vimeo')).toHaveLength(1);
    expect($('img')).toHaveLength(0);
  });

  it('transforms a URL-only anchor', () => {
    const { $, transformedCount } = transform(
      '<p><a href="https://vimeo.com/123456789"> https://vimeo.com/123456789 </a></p>'
    );

    expect(transformedCount).toBe(1);
    expect($('.rss-content-card--vimeo')).toHaveLength(1);
  });

  it.each([
    '<p>I discussed this <a href="https://vimeo.com/123456789">Vimeo talk</a> in the article.</p>',
    '<p><a href="https://vimeo.com/channels/staffpicks/123456789">Vimeo staff pick</a></p>'
  ])('preserves an ordinary or unsupported Vimeo link', source => {
    const { $, transformedCount } = transform(source);

    expect(transformedCount).toBe(0);
    expect($('a')).toHaveLength(1);
    expect($('.rss-content-card--vimeo')).toHaveLength(0);
  });

  it('does not modify a Vimeo link inside an existing canonical card', () => {
    const source =
      '<figure class="rss-content-card rss-content-card--vimeo" data-embed-provider="vimeo">' +
      '<a href="https://vimeo.com/123456789">https://vimeo.com/123456789</a></figure>';
    const { $, transformedCount } = transform(source);
    const once = $.html();

    expect(transformedCount).toBe(0);
    expect(transformVimeoContent($)).toBe(0);
    expect($.html()).toBe(once);
  });
});

describe('transformVimeoContent sanitization and pipeline integration', () => {
  it('preserves only validated canonical Vimeo card metadata through sanitization', () => {
    const { $ } = transform(
      '<iframe src="https://player.vimeo.com/video/123456789?h=secret" ' +
      'width="640" height="360" onload="alert(1)"></iframe>'
    );
    const sanitized = sanitizeHtmlContent($.html());
    const safe = load(sanitized);
    const card = vimeoCard(safe);

    expect(card.attr('class')).toBe(
      'rss-content-card rss-content-card--embed rss-content-card--vimeo'
    );
    expect(card.attr('data-embed-provider')).toBe('vimeo');
    expect(card.attr('data-embed-id')).toBe('123456789');
    expect(card.attr('data-embed-url')).toBe('https://vimeo.com/123456789');
    expect(card.attr('data-embed-player-url')).toBe(
      'https://player.vimeo.com/video/123456789'
    );
    expect(card.attr('data-embed-aspect-ratio')).toBe('1.7778');
    expect(sanitized).not.toMatch(/iframe|onload|autoplay|style=/i);
  });

  it('does not preserve embed metadata on publisher-owned markup', () => {
    const sanitized = sanitizeHtmlContent(
      '<figure class="publisher" data-embed-provider="vimeo" data-embed-id="123" ' +
      'data-embed-url="https://vimeo.com/123" ' +
      'data-embed-player-url="https://player.vimeo.com/video/123" ' +
      'data-embed-aspect-ratio="1.5" data-extra="unsafe">Publisher</figure>'
    );

    expect(sanitized).toBe('<figure>Publisher</figure>');
  });

  it('transforms Vimeo before iframe removal while retaining raw original content', () => {
    const source =
      '<p>Article introduction.</p>' +
      '<iframe src="https://player.vimeo.com/video/123456789?h=secret" width="640" height="360"></iframe>' +
      '<iframe src="https://video.example/embed/999"></iframe>';
    const result = processHtmlContent(
      source,
      null,
      'https://publisher.example/article',
      { id: 1, userId: 2, feedName: 'Vimeo test feed' },
      'Vimeo pipeline test'
    );

    expect(result.content).toBe(source);
    expect(result.html).toContain('rss-content-card--vimeo');
    expect(result.html).toContain('data-embed-id="123456789"');
    expect(result.html).not.toContain('<iframe');
    expect(result.html).not.toContain('video.example');
    expect(result.text).toBe('Article introduction.Watch on Vimeo');
  });
});
