import { beforeEach, describe, it, expect, vi } from 'vitest';

const hotlinkSetMany = vi.fn(() => Promise.resolve());

vi.mock('../controllers/hotlink.js', () => ({
  default: {
    setMany: hotlinkSetMany
  }
}));

const { default: processHtmlContent } = await import('../services/crawl/processHtmlContent.js');
const { default: processMedia } = await import('../services/crawl/processMedia.js');

const feed = {
  id: 10,
  userId: 20,
  feedName: 'Security Test Feed'
};

describe('crawl content sanitization', () => {
  beforeEach(() => {
    hotlinkSetMany.mockClear();
  });

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
    expect(result.stripped).toContain('Clean text');
    expect(result.text).toBe('Clean text bad link good link');
    expect(result.stripped).toContain('https://example.com/image.jpg');
    expect(result.stripped).toContain('https://news.example/story');
    expect(result.contentStrippedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.stripped).toContain('rel="noopener noreferrer"');
    expect(result.stripped).not.toMatch(/onerror|onclick|javascript:|<iframe|<script|<svg|style=/i);
  });

  it('stores outbound links with one batch per article', () => {
    processHtmlContent(
      '<a href="https://first.example/article">First</a><a href="https://second.example/article?source=rss">Second</a>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Hotlink batch test'
    );

    expect(hotlinkSetMany).toHaveBeenCalledTimes(1);
    expect(hotlinkSetMany).toHaveBeenCalledWith(
      ['https://first.example/article', 'https://second.example/article?source=rss'],
      feed.id,
      feed.userId
    );
  });

  it('does not collect a normalized same-origin link as a hotlink', () => {
    const result = processHtmlContent(
      '<a href="/internal/story">Internal story</a>',
      null,
      'https://origin.example/articles/current',
      feed,
      'Same-origin link test'
    );

    expect(result.stripped).toContain('href="https://origin.example/internal/story"');
    expect(hotlinkSetMany).toHaveBeenCalledWith([], feed.id, feed.userId);
  });

  it('collects a normalized external link as a hotlink', () => {
    const result = processHtmlContent(
      '<a href="//external.example/story">External story</a>',
      null,
      'https://origin.example/articles/current',
      feed,
      'External link test'
    );

    expect(result.stripped).toContain('href="https://external.example/story"');
    expect(hotlinkSetMany).toHaveBeenCalledWith(
      ['https://external.example/story'],
      feed.id,
      feed.userId
    );
  });

  it('treats hostname substring attacks as external hotlinks', () => {
    processHtmlContent(
      '<a href="https://origin.example.attacker.test/story">External story</a>',
      null,
      'https://origin.example/articles/current',
      feed,
      'Hostname comparison test'
    );

    expect(hotlinkSetMany).toHaveBeenCalledWith(
      ['https://origin.example.attacker.test/story'],
      feed.id,
      feed.userId
    );
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
    expect(result.text).toBe('eff.org/deeplinks/2026/06/are-…');
    expect(result.stripped).toContain(`href="${href}"`);
    expect(result.stripped).toContain('>eff.org/deeplinks/2026/06/are-…</a>');
    expect(result.stripped).not.toMatch(/class="(?:invisible|ellipsis)"/);
  });

  it('does not add an ellipsis when a publisher-styled link has no hidden suffix', () => {
    const result = processHtmlContent(
      '<a href="https://example.com/article"><span class="invisible">https://</span><span class="ellipsis">example.com/article</span></a>',
      null,
      'https://origin.example/feed-item',
      feed,
      'Visible link test'
    );

    expect(result.text).toBe('example.com/article');
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
    expect(result.stripped).toContain('<span class="invisible">Keep this text</span>');
    expect(result.stripped).toContain('Label <span class="ellipsis">continued</span>');
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
    expect(result.stripped).toBe('2 < 3 & 4.');
    expect(result.text).toBe('2 < 3 & 4.');
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.language).toBe('unknown');
    expect(result.title).toBe('2 < 3 & 4.');
    expect(hotlinkSetMany).not.toHaveBeenCalled();
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

    expect(paragraph.contentHash).not.toBe(division.contentHash);
    expect(paragraph.contentStrippedHash).toBe(division.contentStrippedHash);
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
