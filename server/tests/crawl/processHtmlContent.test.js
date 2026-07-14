import { load } from 'cheerio';
import { describe, it, expect } from 'vitest';

const { default: processHtmlContent } = await import('../../services/crawl/processHtmlContent.js');
const { default: processMedia } = await import('../../services/crawl/processMedia.js');

const feed = {
  id: 10,
  userId: 20,
  feedName: 'Security Test Feed'
};

describe('crawl content sanitization', () => {
  it('strips executable tags, event attributes, unsafe URLs, and hostile embeds before storage', () => {
    const result = processHtmlContent(
      `
        <article onclick="alert(1)">
          <p>Clean text <img src="https://example.com/image.jpg" onerror="alert(1)" style="color:red"></p>
          <a href="javascript:alert(1)" target="_blank" onclick="alert(1)">bad link</a>
          <a href="https://news.example/story" target="_blank">good link</a>
          <iframe src="https://evil.example/embed"></iframe>
          <script>alert(1)</script>
          <svg><animate onbegin="alert(1)" /></svg>
        </article>
      `,
      null,
      'https://origin.example/feed-item',
      feed,
      'Sanitizer test'
    );

    expect(result.content).toContain('onclick="alert(1)"');
    expect(result.content).toContain('<script>alert(1)</script>');
    expect(result.html).toContain('Clean text');
    expect(result.text).toBe('Clean text bad link good link');
    expect(result.html).toContain('https://example.com/image.jpg');
    expect(result.html).toContain('https://news.example/story');
    expect(result.contentTextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.hotlinkUrls).toEqual(['https://news.example/story']);
    expect(result.html).toContain('rel="noopener noreferrer"');
    expect(result.html).not.toMatch(/onerror|onclick|javascript:|<iframe|<script|<svg|style=/i);
  });

  it('sanitizes HTML when the article URL is missing', () => {
    const result = processHtmlContent(
      '<p onclick="alert(1)">Safe body</p><script>alert(1)</script>',
      null,
      null,
      feed,
      'Missing URL test'
    );

    expect(result).toBeDefined();
    expect(result.html).toContain('<p>Safe body</p>');
    expect(result.html).not.toMatch(/onclick|<script/i);
    expect(result.text).toBe('Safe body');
    expect(result.hotlinkUrls).toEqual([]);
  });

  it('stores sanitized article fragments without document wrappers', () => {
    const result = processHtmlContent(
      '<!doctype html><html><head><title>Publisher title</title></head>' +
      '<body><article><p>Article body</p></article></body></html>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Fragment test'
    );

    expect(result.html).toBe('<article><p>Article body</p></article>');
    expect(result.html).not.toMatch(/<\/?(?:html|head|body)\b/i);
    expect(result.html).not.toContain('Publisher title');
    expect(result.text).toBe('Article body');
  });

  it('normalizes and preserves responsive image markup for display', () => {
    const result = processHtmlContent(
      '<picture>' +
      '<source srcset="/images/photo-640.avif 640w, /images/photo-1280.avif 1280w" ' +
      'sizes="(max-width: 640px) 100vw, 640px" media="(min-width: 30rem)" ' +
      'type="image/avif">' +
      '<img src="/images/photo.jpg" srcset="/images/photo-640.jpg 640w, ' +
      '/images/photo-1280.jpg 1280w" sizes="(max-width: 640px) 100vw, 640px">' +
      '</picture>',
      null,
      'https://origin.example/articles/current',
      feed,
      'Responsive image test'
    );
    const $ = load(result.html);

    expect($('source').attr('srcset')).toBe(
      'https://origin.example/images/photo-640.avif 640w, ' +
      'https://origin.example/images/photo-1280.avif 1280w'
    );
    expect($('source').attr('sizes')).toBe('(max-width: 640px) 100vw, 640px');
    expect($('source').attr('media')).toBe('(min-width: 30rem)');
    expect($('img').attr('srcset')).toBe(
      'https://origin.example/images/photo-640.jpg 640w, ' +
      'https://origin.example/images/photo-1280.jpg 1280w'
    );
    expect($('img').attr('sizes')).toBe('(max-width: 640px) 100vw, 640px');
    expect(result.contentTextHash).toBeNull();
  });

  it('preserves encoded markup as literal visible text during HTML parsing', () => {
    const source = '<p>Use &lt;script&gt; for this example</p>';
    const result = processHtmlContent(
      source,
      null,
      'https://origin.example/feed-item',
      feed,
      'Encoded markup test'
    );

    expect(result.content).toBe(source);
    expect(result.html).toBe(source);
    expect(result.text).toBe('Use <script> for this example');
  });

  it('returns outbound links without persisting them', () => {
    const result = processHtmlContent(
      '<a href="https://first.example/article">First</a><a href="https://second.example/article?source=rss">Second</a>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Hotlink batch test'
    );

    expect(result.hotlinkUrls).toEqual([
      'https://first.example/article',
      'https://second.example/article?source=rss'
    ]);
  });

  it('does not collect a normalized same-origin link as a hotlink', () => {
    const result = processHtmlContent(
      '<a href="/internal/story">Internal story</a>',
      null,
      'https://origin.example/articles/current',
      feed,
      'Same-origin link test'
    );

    expect(result.html).toContain('href="https://origin.example/internal/story"');
    expect(result.hotlinkUrls).toEqual([]);
  });

  it('treats apex and www hosts as the same publisher without merging other subdomains', () => {
    const apexArticle = processHtmlContent(
      '<a href="https://www.example.com/internal">WWW alias</a>' +
      '<a href="https://blog.example.com/story">Blog</a>',
      null,
      'https://example.com/articles/current',
      feed,
      'WWW hostname comparison test'
    );
    const wwwArticle = processHtmlContent(
      '<a href="https://example.com/internal">Apex alias</a>',
      null,
      'https://www.example.com/articles/current',
      feed,
      'Apex hostname comparison test'
    );

    expect(apexArticle.hotlinkUrls).toEqual(['https://blog.example.com/story']);
    expect(wwwArticle.hotlinkUrls).toEqual([]);
  });

  it('collects a normalized external link as a hotlink', () => {
    const result = processHtmlContent(
      '<a href="//external.example/story">External story</a>',
      null,
      'https://origin.example/articles/current',
      feed,
      'External link test'
    );

    expect(result.html).toContain('href="https://external.example/story"');
    expect(result.hotlinkUrls).toEqual(['https://external.example/story']);
  });

  it('normalizes relative Ghost card URLs before canonical card conversion', () => {
    const result = processHtmlContent(
      '<figure class="kg-bookmark-card">' +
      '<a class="kg-bookmark-container" href="/articles/example">' +
      '<div class="kg-bookmark-title">Example article</div>' +
      '<div class="kg-bookmark-thumbnail"><img src="/images/example.jpg"></div>' +
      '</a></figure>',
      null,
      'https://example.com/feed/post',
      feed,
      'Relative Ghost card'
    );

    expect(result.html).toContain('rss-content-card--ghost');
    expect(result.html).toContain('href="https://example.com/articles/example"');
    expect(result.html).toContain('src="https://example.com/images/example.jpg"');
    expect(result.html).not.toMatch(/kg-bookmark/);
  });

  it('normalizes a relative WordPress embed link before canonical card conversion', () => {
    const result = processHtmlContent(
      '<blockquote class="wp-embedded-content">' +
      '<a href="/posts/example">Example post</a></blockquote>',
      null,
      'https://example.com/feed/post',
      feed,
      'Relative WordPress card'
    );

    expect(result.html).toContain('rss-content-card--wordpress');
    expect(result.html).toContain('href="https://example.com/posts/example"');
    expect(result.html).not.toContain('wp-embedded-content');
  });

  it('recovers and resolves a relative lazy card image before card conversion', () => {
    const result = processHtmlContent(
      '<figure class="kg-bookmark-card">' +
      '<a class="kg-bookmark-container" href="/articles/example">' +
      '<div class="kg-bookmark-title">Lazy image article</div>' +
      '<div class="kg-bookmark-thumbnail">' +
      '<img src="placeholder.gif" data-src="/images/real.jpg"></div>' +
      '</a></figure>',
      null,
      'https://example.com/feed/post',
      feed,
      'Relative lazy card image'
    );

    expect(result.html).toContain('rss-content-card--ghost');
    expect(result.html).toContain('src="https://example.com/images/real.jpg"');
    expect(result.html).not.toMatch(/placeholder\.gif|data-src/);
  });

  it('does not canonicalize or throw for a malformed publisher-card URL', () => {
    const result = processHtmlContent(
      '<figure class="kg-bookmark-card">' +
      '<a class="kg-bookmark-container" href="https://[invalid">' +
      '<div class="kg-bookmark-title">Malformed card</div></a></figure>',
      null,
      'https://example.com/feed/post',
      feed,
      'Malformed publisher card'
    );

    expect(result).toBeDefined();
    expect(result.html).toContain('Malformed card');
    expect(result.html).not.toContain('rss-content-card');
  });

  it('treats hostname substring attacks as external hotlinks', () => {
    const result = processHtmlContent(
      '<a href="https://origin.example.attacker.test/story">External story</a>',
      null,
      'https://origin.example/articles/current',
      feed,
      'Hostname comparison test'
    );

    expect(result.hotlinkUrls).toEqual(['https://origin.example.attacker.test/story']);
  });

  it('normalizes publisher-styled truncated links before extracting visible text', () => {
    const href = 'https://www.eff.org/deeplinks/2026/06/are-your-local-police-using-flock-safety-alprs-scan-immigrants';
    const source = `<a href="${href}" target="_blank" rel="nofollow noopener" translate="no"><span class="invisible">https://www.</span><span class="ellipsis">eff.org/deeplinks/2026/06/are-</span><span class="invisible">your-local-police-using-flock-safety-alprs-scan-immigrants</span></a>`;
    const result = processHtmlContent(
      source,
      null,
      'https://origin.example/feed-item',
      feed,
      'Truncated link test'
    );

    expect(result.content).toBe(source);
    expect(result.text).toBe(href);
    expect(result.html).toContain(`href="${href}"`);
    expect(result.html).toContain('<span>https://www.</span>');
    expect(result.html).toContain('<span class="ellipsis">eff.org/deeplinks/2026/06/are-</span>');
    expect(result.html).not.toContain('class="invisible"');
  });

  it('does not add an ellipsis when a publisher-styled link has no hidden suffix', () => {
    const result = processHtmlContent(
      '<a href="https://example.com/article"><span class="invisible">https://</span><span class="ellipsis">example.com/article</span></a>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Visible link test'
    );

    expect(result.text).toBe('https://example.com/article');
  });

  it('normalizes a Mastodon link whose visible span has an empty class', () => {
    const source = '<a href="https://eff.org/summer" target="_blank" rel="nofollow noopener" translate="no"><span class="invisible">https://</span><span class="">eff.org/summer</span><span class="invisible"></span></a>';
    const result = processHtmlContent(
      source,
      null,
      'https://origin.example/feed-item',
      feed,
      'Mastodon visible link test'
    );

    expect(result.content).toBe(source);
    expect(result.text).toBe('https://eff.org/summer');
    expect(result.html).toContain('<span>https://</span><span>eff.org/summer</span>');
    expect(result.html).not.toContain('class="invisible"');
  });

  it('preserves unrelated invisible elements and mixed-content links', () => {
    const result = processHtmlContent(
      '<span class="invisible">Keep this text</span> <a href="https://example.com">Label <span class="ellipsis">continued</span><span class="invisible">suffix</span></a>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Unrelated invisible content test'
    );

    expect(result.text).toBe('Keep this text Label continuedsuffix');
    expect(result.html).toContain('<span class="invisible">Keep this text</span>');
    expect(result.html).toContain('Label <span class="ellipsis">continued</span>');
  });

  it('uses a safe fast path for plain text without parsing HTML', () => {
    const result = processHtmlContent(
      '2 < 3 & 4.',
      null,
      'https://origin.example/feed-item',
      feed,
      'Untitled'
    );

    expect(result.content).toBe('2 < 3 & 4.');
    expect(result.html).toBe('<p>2 &lt; 3 &amp; 4.</p>');
    expect(result.text).toBe('2 < 3 & 4.');
    expect(result.contentSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.language).toBe('unknown');
    expect(result.title).toBe('2 < 3 & 4.');
    expect(result.hotlinkUrls).toEqual([]);
  });

  it('skips unreliable language detection for short HTML content', () => {
    const result = processHtmlContent(
      '<p>This is English.</p>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Short HTML language test'
    );

    expect(result.text).toBe('This is English.');
    expect(result.language).toBe('unknown');
  });

  it('preserves paragraph boundaries in plain-text content', () => {
    const result = processHtmlContent(
      'Line one.\r\n\r\nLine two.\r\n',
      null,
      'https://origin.example/feed-item',
      feed,
      'Plain-text paragraphs'
    );

    expect(result.content).toBe('Line one.\r\n\r\nLine two.\r\n');
    expect(result.html).toBe('<p>Line one.</p>\n<p>Line two.</p>');
    expect(result.text).toBe('Line one.\n\nLine two.');
  });

  it('encodes markup-like text in the plain-text fast path', () => {
    const result = processHtmlContent(
      '&lt;img src=x onerror=alert(1)&gt; &amp; readable text',
      null,
      'https://origin.example/feed-item',
      feed,
      'Encoded plain text'
    );

    expect(result.text).toBe('<img src=x onerror=alert(1)> & readable text');
    expect(result.html).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; readable text</p>'
    );
    expect(result.html).not.toContain('<img');
  });

  it('keeps markup-like encoded HTML text display-safe', () => {
    const result = processHtmlContent(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; fallback text</p>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Encoded HTML safety test'
    );

    expect(result.text).toBe('<img src=x onerror=alert(1)> & fallback text');
    expect(result.html).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; fallback text</p>'
    );
    expect(result.html).not.toContain('<img');
  });

  it('separates original source identity from visible text identity', () => {
    const paragraph = processHtmlContent(
      '<p>Same visible text</p>',
      null,
      'https://origin.example/paragraph',
      feed,
      'Paragraph'
    );
    const division = processHtmlContent(
      '<div>Same visible text</div>',
      null,
      'https://origin.example/division',
      feed,
      'Division'
    );

    expect(paragraph.contentSourceHash).not.toBe(division.contentSourceHash);
    expect(paragraph.contentTextHash).toBe(division.contentTextHash);
  });

  it('filters unsafe URLs from normalized media attributes', () => {
    const result = processMedia({
      title: 'Media "title" <img src=x onerror=alert(1)>',
      enclosures: [
        {
          type: 'image/png',
          url: 'javascript:alert(1)'
        }
      ],
      media: {
        group: {
          contents: [
            {
              type: 'video/mp4',
              url: 'https://video.example/watch?v=1',
              image: 'https://cdn.example/image.png',
              title: '<strong onclick="alert(1)">Video</strong>'
            }
          ]
        }
      }
    });

    expect(result).toEqual(expect.objectContaining({
      type: 'video',
      url: 'https://video.example/watch?v=1',
      thumbnailUrl: 'https://cdn.example/image.png',
      mimeType: 'video/mp4'
    }));
    expect(JSON.stringify(result)).not.toMatch(/javascript:|onerror/i);
  });
});
