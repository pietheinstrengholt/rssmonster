import { describe, expect, it } from 'vitest';

import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';

describe('Feedsmith adapter', () => {
  it('returns the RSSMonster canonical feed and entry contract', () => {
    const feed = parseFeedSource(`
      <rss version="2.0"
        xmlns:content="http://purl.org/rss/1.0/modules/content/"
        xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>Example feed</title>
          <description>Example description</description>
          <link>https://example.com</link>
          <image><url>https://example.com/icon.png</url></image>
          <item>
            <title>Canonical article</title>
            <link>https://example.com/articles/1</link>
            <guid>article-1</guid>
            <pubDate>Wed, 15 Jul 2026 10:00:00 GMT</pubDate>
            <description>Article summary</description>
            <content:encoded><![CDATA[<p>Article body</p>]]></content:encoded>
            <media:thumbnail url="https://example.com/article.jpg" width="1200" height="675" />
          </item>
        </channel>
      </rss>
    `);

    expect(feed).toMatchObject({
      format: 'rss',
      title: 'Example feed',
      description: 'Example description',
      faviconUrl: 'https://example.com/icon.png',
      entries: [{
        title: 'Canonical article',
        url: 'https://example.com/articles/1',
        description: 'Article summary',
        content: '<p>Article body</p>',
        externalId: 'article-1',
        externalIdType: 'guid',
        publishedAt: '2026-07-15T10:00:00.000Z'
      }]
    });
    expect(feed).not.toHaveProperty('feed');
    expect(feed.entries[0]).not.toHaveProperty('guid');
    expect(feed.entries[0].modifiedAt).toBeNull();
    expect(feed.entries[0].imageCandidates).toEqual([
      expect.objectContaining({
        url: 'https://example.com/article.jpg',
        width: 1200,
        height: 675,
        source: 'media-thumbnail'
      })
    ]);
  });

  it('normalizes native JSON Feed metadata, HTML content, identity, and attachments', () => {
    const feed = parseFeedSource(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'JSON example',
      home_page_url: 'https://example.com',
      feed_url: 'https://example.com/feed.json',
      icon: 'https://example.com/icon.png',
      favicon: 'https://example.com/favicon.ico',
      description: 'A native JSON Feed',
      items: [{
        id: 'json-item-1',
        url: 'https://example.com/articles/json-1',
        title: 'JSON article',
        content_html: '<p>JSON article body</p>',
        summary: 'JSON summary',
        date_published: '2026-07-16T08:30:00Z',
        date_modified: '2026-07-16T09:45:00.987654Z',
        tags: ['JSON', 'Feeds'],
        authors: [{ name: 'Jane JSON' }],
        image: 'https://example.com/article-image.jpg',
        attachments: [{
          url: 'https://cdn.example.com/episode.mp3',
          mime_type: 'audio/mpeg',
          size_in_bytes: 123456,
          duration_in_seconds: 125
        }]
      }]
    }));

    expect(feed).toMatchObject({
      format: 'json',
      title: 'JSON example',
      description: 'A native JSON Feed',
      faviconUrl: 'https://example.com/favicon.ico',
      selfUrl: 'https://example.com/feed.json',
      entries: [{
        title: 'JSON article',
        url: 'https://example.com/articles/json-1',
        description: 'JSON summary',
        content: '<p>JSON article body</p>',
        author: 'Jane JSON',
        categories: ['JSON', 'Feeds'],
        publishedAt: '2026-07-16T08:30:00.000Z',
        modifiedAt: '2026-07-16T09:45:00.987Z',
        externalId: 'json-item-1',
        externalIdType: 'json-id',
        media: {
          type: 'audio',
          url: 'https://cdn.example.com/episode.mp3',
          mimeType: 'audio/mpeg',
          fileSize: 123456,
          durationSeconds: 125
        }
      }]
    });
    expect(feed.entries[0].imageCandidates).toEqual([
      expect.objectContaining({
        url: 'https://example.com/article-image.jpg',
        source: 'publisher'
      })
    ]);
  });

  it('uses JSON Feed text content, external URLs, and image attachments as fallbacks', () => {
    const feed = parseFeedSource(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Text feed',
      items: [{
        id: 'json-text-1',
        external_url: 'https://external.example.com/story',
        content_text: 'First paragraph.\n\nSecond paragraph.',
        authors: [{ url: 'https://example.com/authors/anonymous' }],
        attachments: [{
          url: 'https://cdn.example.com/lead.webp',
          mime_type: 'image/webp',
          size_in_bytes: 654321
        }]
      }]
    }));

    expect(feed.entries[0]).toMatchObject({
      title: 'Untitled',
      url: 'https://external.example.com/story',
      content: 'First paragraph.\n\nSecond paragraph.',
      author: null,
      externalId: 'json-text-1',
      externalIdType: 'json-id',
      media: null
    });
    expect(feed.entries[0].imageCandidates).toEqual([
      expect.objectContaining({
        url: 'https://cdn.example.com/lead.webp',
        mimeType: 'image/webp',
        source: 'enclosure'
      })
    ]);
  });
});
