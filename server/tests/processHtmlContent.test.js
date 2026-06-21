import { beforeEach, describe, it, expect, vi } from 'vitest';

const hotlinkSetMany = vi.fn(() => Promise.resolve());

vi.mock('../controllers/hotlink.js', () => ({
  default: {
    setMany: hotlinkSetMany
  }
}));

const { default: processHtmlContent } = await import('../controllers/crawl/processHtmlContent.js');
const { default: processMedia } = await import('../controllers/crawl/processMedia.js');

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

    expect(result.content).toContain('Clean text');
    expect(result.content).toContain('https://example.com/image.jpg');
    expect(result.content).toContain('https://news.example/story');
    expect(result.content).toContain('rel="noopener noreferrer"');
    expect(result.content).not.toMatch(/onerror|onclick|javascript:|<iframe|<script|<svg|style=/i);
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
      ['https://first.example/article', 'https://second.example/article'],
      feed.id,
      feed.userId
    );
  });

  it('escapes and filters media-only feed content before storage', () => {
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
              url: 'https://video.example/watch?v=1',
              image: 'https://cdn.example/image.png',
              title: '<strong onclick="alert(1)">Video</strong>'
            }
          ]
        }
      }
    });

    expect(result.content).toContain('https://cdn.example/image.png');
    expect(result.content).toContain('https://video.example/watch?v=1');
    expect(result.content).toContain('&lt;strong onclick=&quot;alert(1)&quot;&gt;Video&lt;/strong&gt;');
    expect(result.content).not.toMatch(/javascript:|<strong onclick|onerror/i);
    expect(result.leadImage).toBe('https://cdn.example/image.png');
  });
});
