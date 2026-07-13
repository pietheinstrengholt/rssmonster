import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import cleanupHtmlContent from './cleanupHtmlContent.js';

// This function loads malformed HTML without allowing the parser to repair it first.
function loadFragment(html) {
  return load(html, { xml: { xmlMode: false } }, false);
}

// This function returns the normalized text of each element matching a selector.
function textValues($, selector) {
  return $(selector)
    .toArray()
    .map(el => $(el).text().replace(/\s+/g, ' ').trim());
}

describe('cleanupHtmlContent', () => {
  it('wraps consecutive orphan list items in one unordered list', () => {
    const $ = loadFragment(
      '<p>Items:</p><li>First</li><li>Second</li><li>Third</li><p>After list</p>'
    );

    cleanupHtmlContent($);

    expect($('ul')).toHaveLength(1);
    expect(textValues($, 'ul > li')).toEqual(['First', 'Second', 'Third']);
    expect($.root().children().toArray().map(el => el.name)).toEqual(['p', 'ul', 'p']);
  });

  it('ignores whitespace and comments between orphan list items', () => {
    const $ = loadFragment('<li>First</li>\n  <!-- separator -->\n  <li>Second</li>');

    cleanupHtmlContent($);

    expect($('ul')).toHaveLength(1);
    expect(textValues($, 'ul > li')).toEqual(['First', 'Second']);
  });

  it('creates separate lists around meaningful sibling content', () => {
    const $ = loadFragment('<li>First</li><p>Interruption</p><li>Second</li>');

    cleanupHtmlContent($);

    expect($('ul')).toHaveLength(2);
    expect(textValues($, 'ul')).toEqual(['First', 'Second']);
    expect($.root().children().toArray().map(el => el.name)).toEqual(['ul', 'p', 'ul']);
  });

  it('wraps a single orphan list item', () => {
    const $ = loadFragment('<div><li>Only item</li></div>');

    cleanupHtmlContent($);

    expect($('div > ul > li')).toHaveLength(1);
    expect($('div > ul > li').text()).toBe('Only item');
  });

  it('leaves existing unordered and ordered lists unchanged', () => {
    const $ = loadFragment(
      '<ul><li>First</li><li>Second</li></ul><ol><li>Third</li><li>Fourth</li></ol>'
    );
    const original = $.html();

    cleanupHtmlContent($);

    expect($.html()).toBe(original);
  });

  it('leaves valid nested lists unchanged', () => {
    const $ = loadFragment('<ul><li>Parent<ul><li>Child</li></ul></li></ul>');
    const original = $.html();

    cleanupHtmlContent($);

    expect($.html()).toBe(original);
    expect(textValues($, 'ul ul > li')).toEqual(['Child']);
  });

  it('turns orphan table sections, rows, and cells into readable paragraphs', () => {
    const $ = loadFragment(
      '<div><tbody><tr><td>Left</td><td>Right</td></tr></tbody></div>'
    );

    cleanupHtmlContent($);

    expect($('tbody, tr, td, th')).toHaveLength(0);
    expect(textValues($, 'div > p')).toEqual(['Left', 'Right']);
  });

  it('converts a standalone orphan cell while preserving inline markup', () => {
    const $ = loadFragment('<div><td><strong>Name:</strong> <a href="/alice">Alice</a></td></div>');

    cleanupHtmlContent($);

    expect($('div > p')).toHaveLength(1);
    expect($('div > p > strong').text()).toBe('Name:');
    expect($('div > p > a').attr('href')).toBe('/alice');
    expect($('div > p').text().replace(/\s+/g, ' ').trim()).toBe('Name: Alice');
  });

  it('leaves a valid table unchanged', () => {
    const $ = loadFragment(
      '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table>'
    );
    const original = $.html();

    cleanupHtmlContent($);

    expect($.html()).toBe(original);
  });

  it('repairs orphan table elements without changing a valid table', () => {
    const $ = loadFragment(
      '<table><tbody><tr><td>Valid</td></tr></tbody></table>' +
      '<section><tfoot><tr><th>Orphan</th></tr></tfoot></section>'
    );
    const validTable = $('table').html();

    cleanupHtmlContent($);

    expect($('table').html()).toBe(validTable);
    expect($('table tbody > tr > td').text()).toBe('Valid');
    expect(textValues($, 'section > p')).toEqual(['Orphan']);
    expect($('section > tfoot, section > tr, section > th')).toHaveLength(0);
  });

  it('produces the same structure when cleanup runs twice', () => {
    const $ = loadFragment(
      '<div><li>First</li>\n<li>Second</li><tbody><tr><td><em>Value</em></td></tr></tbody></div>'
    );

    cleanupHtmlContent($);
    const firstCleanup = $.html();
    cleanupHtmlContent($);

    expect($.html()).toBe(firstCleanup);
    expect($('ul')).toHaveLength(1);
    expect($('div > p > em').text()).toBe('Value');
  });

  it('preserves existing image, boilerplate, truncated-link, and empty-wrapper cleanup', () => {
    const $ = loadFragment(
      '<div class="newsletter">Remove me</div>' +
      '<img data-src="https://example.com/image.jpg">' +
      '<a href="https://example.com/article">' +
      '<span class="invisible">https://</span>' +
      '<span class="ellipsis">example.com/article</span>' +
      '<span class="invisible">/full</span>' +
      '</a>' +
      '<div><span>  </span></div>'
    );

    cleanupHtmlContent($);

    expect($('.newsletter')).toHaveLength(0);
    expect($('img').attr('src')).toBe('https://example.com/image.jpg');
    expect($('img').attr('loading')).toBe('lazy');
    expect($('a').text()).toBe('example.com/article…');
    expect($('div, span')).toHaveLength(0);
  });

  it('removes empty and whitespace-only wrappers', () => {
    const $ = loadFragment(
      '<div></div><div> \n\t </div><p></p><span>&nbsp;\u200b\ufeff</span>'
    );

    cleanupHtmlContent($);

    expect($.html()).toBe('');
  });

  it('removes every level of nested empty wrappers', () => {
    const $ = loadFragment('<div><span><p> </p></span></div>');

    cleanupHtmlContent($);

    expect($.html()).toBe('');
  });

  it('removes paragraphs containing only line breaks', () => {
    const $ = loadFragment('<p><br></p><p><br><br></p><p><span> </span></p>');

    cleanupHtmlContent($);

    expect($.html()).toBe('');
  });

  it('preserves wrappers containing nested visible text', () => {
    const $ = loadFragment(
      '<div><span>Article text</span></div>' +
      '<p><strong>Important</strong></p>' +
      '<div><a href="https://example.com">Read article</a></div>'
    );
    const original = $.html();

    cleanupHtmlContent($);

    expect($.html()).toBe(original);
  });

  it.each([
    ['img', '<div><img src="https://example.com/image.jpg"></div>'],
    ['picture', '<div><picture><source src="https://example.com/image.webp"></picture></div>'],
    ['figure', '<div><figure></figure></div>'],
    ['figcaption', '<div><figcaption></figcaption></div>'],
    ['audio', '<div><audio src="https://example.com/audio.mp3"></audio></div>'],
    ['video', '<div><video src="https://example.com/video.mp4"></video></div>'],
    ['table', '<div><table><tbody><tr><td>Value</td></tr></tbody></table></div>'],
    ['pre', '<div><pre></pre></div>'],
    ['code', '<div><code></code></div>'],
    ['blockquote', '<div><blockquote></blockquote></div>'],
    ['ul', '<div><ul></ul></div>'],
    ['ol', '<div><ol></ol></div>'],
    ['hr', '<div><hr></div>'],
    ['details', '<div><details></details></div>'],
    ['summary', '<div><summary></summary></div>']
  ])('preserves a wrapper containing a %s element', (_, html) => {
    const $ = loadFragment(html);

    cleanupHtmlContent($);

    expect($('div')).toHaveLength(1);
  });

  it('preserves an image link without treating an empty anchor as meaningful', () => {
    const $ = loadFragment(
      '<div id="media"><a href="https://example.com">' +
      '<img src="https://example.com/a.jpg"></a></div>' +
      '<div id="empty"><a href="https://example.com"></a></div>'
    );

    cleanupHtmlContent($);

    expect($('#media > a > img')).toHaveLength(1);
    expect($('#empty')).toHaveLength(0);
  });

  it('preserves a wrapper containing a canonical publisher card', () => {
    const source = '<div><figure class="rss-content-card rss-content-card--ghost">' +
      '<a class="rss-content-card__link" href="https://example.com/story">Story</a>' +
      '</figure></div>';
    const $ = loadFragment(source);

    cleanupHtmlContent($);

    expect($.html()).toBe(source);
  });

  it('keeps empty-wrapper cleanup idempotent', () => {
    const $ = loadFragment(
      '<div><span><p><br></p></span></div>' +
      '<div><a href="https://example.com"><img src="https://example.com/a.jpg"></a></div>'
    );

    cleanupHtmlContent($);
    const firstCleanup = $.html();
    cleanupHtmlContent($);

    expect($.html()).toBe(firstCleanup);
    expect($('div')).toHaveLength(1);
  });

  it('preserves content regressions while removing publisher whitespace clutter', () => {
    const $ = loadFragment(
      '<div class="newsletter"><blockquote>Remove boilerplate</blockquote></div>' +
      '<div id="image"><img src="https://example.com/image.jpg"></div>' +
      '<div id="code"><code>const x = 1;</code></div>' +
      '<div id="quote"><blockquote>Quoted text</blockquote></div>' +
      '<div id="clutter"><span> \n&nbsp;\u200b </span></div>'
    );

    cleanupHtmlContent($);

    expect($('.newsletter, #clutter')).toHaveLength(0);
    expect($('#image > img')).toHaveLength(1);
    expect($('#code > code').text()).toBe('const x = 1;');
    expect($('#quote > blockquote').text()).toBe('Quoted text');
  });

  it('promotes data-src when an image has no source', () => {
    const $ = loadFragment('<img data-src="https://cdn.example.com/photo.jpg">');

    cleanupHtmlContent($);

    expect($.html()).toBe('<img src="https://cdn.example.com/photo.jpg" loading="lazy">');
  });

  it('preserves an existing meaningful source over lazy alternatives', () => {
    const $ = loadFragment(
      '<img src="https://cdn.example.com/original.jpg" data-src="https://cdn.example.com/lazy.jpg">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe('https://cdn.example.com/original.jpg');
  });

  it.each([
    ['data-image', 'data:image/gif;base64,AAAA'],
    ['transparent GIF', '/images/TRANSPARENT.GIF?cache=1'],
    ['spacer GIF', 'https://cdn.example.com/assets/spacer.gif'],
    ['placeholder PNG', '../images/placeholder.png#preview']
  ])('replaces a %s placeholder source', (_, placeholder) => {
    const $ = loadFragment(
      `<img src="${placeholder}" data-src="https://cdn.example.com/real.jpg">`
    );

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe('https://cdn.example.com/real.jpg');
  });

  it('does not treat a logo filename as a placeholder', () => {
    const $ = loadFragment(
      '<img src="/images/logo.png" data-src="https://cdn.example.com/replacement.jpg">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe('/images/logo.png');
  });

  it('ignores empty lazy attributes and removes the unusable image', () => {
    const $ = loadFragment('<div><img data-src="  " data-original="\n"></div>');

    cleanupHtmlContent($);

    expect($.html()).toBe('');
  });

  it('uses the first supported lazy source and removes recognized lazy attributes', () => {
    const $ = loadFragment(
      '<img data-original="https://cdn.example.com/original.jpg" ' +
      'data-src="https://cdn.example.com/first.jpg" ' +
      'data-lazy-src="https://cdn.example.com/later.jpg" ' +
      'data-keep="publisher-value">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe('https://cdn.example.com/first.jpg');
    expect($('img').attr('data-src')).toBeUndefined();
    expect($('img').attr('data-original')).toBeUndefined();
    expect($('img').attr('data-lazy-src')).toBeUndefined();
    expect($('img').attr('data-keep')).toBe('publisher-value');
  });

  it('promotes an image data-srcset without rewriting its candidates', () => {
    const $ = loadFragment(
      '<img src="/fallback.jpg" data-srcset="/small.jpg 480w, ../large.jpg 1200w">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('srcset')).toBe('/small.jpg 480w, ../large.jpg 1200w');
    expect($('img').attr('data-srcset')).toBeUndefined();
  });

  it('preserves an existing responsive source over a lazy srcset', () => {
    const $ = loadFragment(
      '<img src="/fallback.jpg" srcset="/current.jpg 1x" data-srcset="/lazy.jpg 2x">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('srcset')).toBe('/current.jpg 1x');
  });

  it('supports data-lazy-srcset on images', () => {
    const $ = loadFragment(
      '<img src="/fallback.jpg" data-lazy-srcset="/image.jpg 1x, /image@2x.jpg 2x">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('srcset')).toBe('/image.jpg 1x, /image@2x.jpg 2x');
    expect($('img').attr('data-lazy-srcset')).toBeUndefined();
  });

  it('normalizes lazy picture sources while preserving the picture structure', () => {
    const $ = loadFragment(
      '<picture><source data-srcset="/photo.avif 1x, /photo@2x.avif 2x">' +
      '<img src="/placeholder.gif" data-src="/photo.jpg"></picture>'
    );

    cleanupHtmlContent($);

    expect($('picture')).toHaveLength(1);
    expect($('picture > source').attr('srcset')).toBe('/photo.avif 1x, /photo@2x.avif 2x');
    expect($('picture > source').attr('loading')).toBeUndefined();
    expect($('picture > img').attr('src')).toBe('/photo.jpg');
  });

  it('promotes lazy source URLs on picture source elements', () => {
    const $ = loadFragment('<picture><source data-src="/photo.webp"></picture>');

    cleanupHtmlContent($);

    expect($('source').attr('src')).toBe('/photo.webp');
    expect($('source').attr('data-src')).toBeUndefined();
  });

  it('keeps recovered relative image URLs for the later URL-normalization stage', () => {
    const $ = loadFragment('<img src="placeholder.gif" data-original-src="../images/photo.jpg">');

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe('../images/photo.jpg');
  });

  it('removes placeholders without recoverable lazy sources', () => {
    const $ = loadFragment(
      '<div><img src="data:image/gif;base64,AAAA"></div>' +
      '<p><img src="/images/clear.gif"></p>'
    );

    cleanupHtmlContent($);

    expect($.html()).toBe('');
  });

  it('continues removing explicit tracking pixels', () => {
    const $ = loadFragment(
      '<img src="https://tracker.example.com/pixel.jpg" width="1" height="1">'
    );

    cleanupHtmlContent($);

    expect($('img')).toHaveLength(0);
  });

  it('removes placeholder dimensions from a recovered real image', () => {
    const $ = loadFragment(
      '<img src="placeholder.gif" data-image="https://cdn.example.com/photo.jpg" ' +
      'width="1" height="1">'
    );

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe('https://cdn.example.com/photo.jpg');
    expect($('img').attr('width')).toBeUndefined();
    expect($('img').attr('height')).toBeUndefined();
  });

  it('preserves explicit loading behavior and adds lazy loading when missing', () => {
    const $ = loadFragment(
      '<img src="/eager.jpg" loading="eager"><img src="/lazy.jpg">'
    );

    cleanupHtmlContent($);

    expect($('img').first().attr('loading')).toBe('eager');
    expect($('img').last().attr('loading')).toBe('lazy');
  });

  it('handles malformed attribute values without throwing', () => {
    const $ = loadFragment(
      '<img src="http://[malformed" data-src="https://cdn.example.com/lazy.jpg">'
    );

    expect(() => cleanupHtmlContent($)).not.toThrow();
    expect($('img').attr('src')).toBe('http://[malformed');
  });

  it.each([
    ['data-cfsrc', 'https://cdn.example.com/cloudflare.jpg'],
    ['data-flickity-lazyload', 'https://cdn.example.com/carousel.jpg']
  ])('supports the %s lazy source attribute', (attribute, source) => {
    const $ = loadFragment(`<img ${attribute}="${source}">`);

    cleanupHtmlContent($);

    expect($('img').attr('src')).toBe(source);
    expect($('img').attr(attribute)).toBeUndefined();
  });

  it('removes every recognized lazy srcset attribute after promotion', () => {
    const $ = loadFragment(
      '<picture><source data-srcset="/first.jpg 1x" data-lazy-srcset="/second.jpg 2x" ' +
      'data-original-srcset="/third.jpg 3x" data-keep="publisher-value"></picture>'
    );

    cleanupHtmlContent($);

    expect($('source').attr('srcset')).toBe('/first.jpg 1x');
    expect($('source').attr('data-srcset')).toBeUndefined();
    expect($('source').attr('data-lazy-srcset')).toBeUndefined();
    expect($('source').attr('data-original-srcset')).toBeUndefined();
    expect($('source').attr('data-keep')).toBe('publisher-value');
  });
});
