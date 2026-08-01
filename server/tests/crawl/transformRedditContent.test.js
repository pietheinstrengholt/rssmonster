import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { transformRedditContent } from '../../services/crawl/content/compatibility/transformRedditContent.js';

// Loads publisher markup as an HTML fragment for compatibility transformation.
function loadFragment(html) {
  return load(html, { xml: { xmlMode: false } }, false);
}

describe('transformRedditContent', () => {
  // Converts a complete Reddit RSS table into one readable semantic card.
  it('extracts media, body, byline, and action links from a Reddit layout', () => {
    const $ = loadFragment(`
      <table><tr>
        <td>
          <a href="https://i.redd.it/gallery.jpg">
            <img src="https://preview.redd.it/thumb.jpg">
            <img data-src="https://preview.redd.it/second.jpg">
          </a>
        </td>
        <td>
          <p>Story <strong>body</strong></p>
          submitted by <a href="/user/alice"></a>
          to <a href="/r/javascript/"></a>
          <a href="https://example.com/story">[link]</a>
          <a href="/r/javascript/comments/abc/title">[comments]</a>
          <br><span> </span>
        </td>
      </tr></table>
    `);

    expect(transformRedditContent($)).toBe(1);
    expect($('.publisher-card--reddit')).toHaveLength(1);
    expect($('.publisher-card__media img')).toHaveLength(2);
    expect($('.publisher-card__media > a').attr('href')).toBe('https://i.redd.it/gallery.jpg');
    expect($('.publisher-card__content').text().replace(/\s+/g, ' ').trim()).toBe('Story body');
    expect($('.publisher-card__byline').text()).toBe('Submitted by u/alice to r/javascript');
    expect($('.publisher-card__actions a').toArray().map(link => $(link).attr('href'))).toEqual([
      'https://example.com/story',
      '/r/javascript/comments/abc/title'
    ]);
    expect($('table')).toHaveLength(0);
  });

  // Uses media and comments URLs when labeled action links and byline metadata are absent.
  it('falls back to Reddit media and discussion links', () => {
    const $ = loadFragment(`
      <table><tr>
        <td><img data-src="https://i.redd.it/photo.jpg"></td>
        <td>
          <p>Photo description</p>
          <a href="https://i.redd.it/photo.jpg">Media</a>
          <a href="https://www.reddit.com/r/pics/comments/xyz/photo">Read discussion</a>
        </td>
      </tr></table>
    `);

    expect(transformRedditContent($)).toBe(1);
    expect($('.publisher-card__media > a').attr('href'))
      .toBe('https://www.reddit.com/r/pics/comments/xyz/photo');
    expect($('.publisher-card__actions a').toArray().map(link => $(link).text())).toEqual([
      'View original',
      'Comments'
    ]);
    expect($('.publisher-card__byline')).toHaveLength(0);
    expect($('.publisher-card__content').text().replace(/\s+/g, ' ').trim())
      .toBe('Photo description');
  });

  // Recognizes Reddit's text-only metadata signals without inventing unavailable links.
  it('transforms a text-signaled layout without creating empty metadata', () => {
    const $ = loadFragment(`
      <table><tr>
        <td><img src="https://cdn.example.com/thumb.jpg"></td>
        <td><p>submitted by u/alice to r/testing</p><blockquote>Quoted body</blockquote></td>
      </tr></table>
    `);

    expect(transformRedditContent($)).toBe(1);
    expect($('.publisher-card__media > img')).toHaveLength(1);
    expect($('.publisher-card__content blockquote').text()).toBe('Quoted body');
    expect($('.publisher-card__meta')).toHaveLength(0);
  });

  // Preserves visible user labels and avoids duplicating a comments URL as the original action.
  it('supports relative Reddit links and separates extracted metadata from the body', () => {
    const commentsUrl = '/r/news/comments/abc/story';
    const $ = loadFragment(`
      <table><tr>
        <td><img src="https://preview.redd.it/news.jpg"></td>
        <td>
          <div><span>Article summary</span></div>
          <a href="/user/bob">/u/bob</a>
          <a href="/r/news">r/news</a>
          <a href="${commentsUrl}">[link]</a>
          <a href="${commentsUrl}">[comments]</a>
        </td>
      </tr></table>
    `);

    expect(transformRedditContent($)).toBe(1);
    expect($('.publisher-card__byline').text()).toBe('Submitted by u/bob to r/news');
    expect($('.publisher-card__actions a')).toHaveLength(1);
    expect($('.publisher-card__actions a').attr('href')).toBe(commentsUrl);
    expect($('.publisher-card__content').text().trim()).toBe('Article summary');
  });

  // Leaves ordinary, malformed, and already-transformed tables unchanged.
  it.each([
    '<table><tr><td><img src="https://example.com/a.jpg"></td></tr></table>',
    '<table><tr><td><img src="https://example.com/a.jpg"></td><th>submitted by u/a</th></tr></table>',
    '<table><tr><td>no image</td><td>submitted by u/a to r/test</td></tr></table>',
    '<table><tr><td><img src="https://example.com/a.jpg"></td><td>ordinary article</td></tr></table>',
    '<table><tr><td><img src="https://example.com/a.jpg"></td><td><a href="/user/a">Profile</a></td></tr></table>',
    '<table><tr><td><img src="https://example.com/a.jpg"></td><td>submitted by u/a</td></tr><tr><td>x</td><td>y</td></tr></table>',
    '<div class="publisher-card--reddit"><table><tr><td><img src="https://i.redd.it/a.jpg"></td><td>submitted by u/a to r/test</td></tr></table></div>',
    '<div aria-label="Reddit post"><table><tr><td><img src="https://i.redd.it/a.jpg"></td><td>submitted by u/a to r/test</td></tr></table></div>'
  ])('does not transform unsupported markup %#', html => {
    const $ = loadFragment(html);
    const original = $.html();

    expect(transformRedditContent($)).toBe(0);
    expect($.html()).toBe(original);
  });

  // Transforms each recognized table once and leaves generated cards stable on repeat runs.
  it('handles multiple tables idempotently', () => {
    const redditTable = `
      <table><tr>
        <td><a href="https://redd.it/image"><img src="https://i.redd.it/image.jpg"></a></td>
        <td><a href="https://reddit.com/user/alice">u/alice</a> submitted by</td>
      </tr></table>
    `;
    const $ = loadFragment(redditTable + redditTable);

    expect(transformRedditContent($)).toBe(2);
    const transformed = $.html();
    expect(transformRedditContent($)).toBe(0);
    expect($.html()).toBe(transformed);
    expect($('.publisher-card--reddit')).toHaveLength(2);
  });
});
