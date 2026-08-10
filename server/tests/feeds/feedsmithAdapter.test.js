import { describe, expect, it } from 'vitest';

import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';

describe('Feedsmith adapter', () => {
  it.each([
    ['/articles/one', 'https://feeds.example.com/articles/one'],
    ['../articles/two', 'https://feeds.example.com/articles/two'],
    ['//cdn.example.com/articles/three', 'https://cdn.example.com/articles/three']
  ])('resolves entry link %s against the fetched feed URL', (link, expected) => {
    const feed = parseFeedSource(`
      <rss version="2.0"><channel><title>Relative links</title><link>https://site.example/</link>
        <item><title>Relative article</title><guid>relative-guid</guid>
          <link>${link}</link><description>Body</description></item>
      </channel></rss>
    `, { feedUrl: 'https://feeds.example.com/news/feed.xml' });

    expect(feed.entries[0]).toMatchObject({ url: expected, urlStatus: 'resolved' });
  });

  it('honors entry xml:base before feed xml:base and the fetched feed URL', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom" xml:base="../feed-base/">
        <title>XML base</title><id>xml-base-feed</id>
        <entry xml:base="https://entries.example.com/posts/">
          <title>Based entry</title><id>based-entry</id><link href="story" />
          <content>Body</content>
        </entry>
      </feed>
    `, { feedUrl: 'https://feeds.example.com/news/feed.xml' });

    expect(feed.entries[0]).toMatchObject({
      url: 'https://entries.example.com/posts/story',
      urlStatus: 'resolved',
      externalId: 'based-entry',
      externalIdType: 'atom-id'
    });
  });

  it('uses an absolute publisher site URL when fetch provenance is unavailable', () => {
    const feed = parseFeedSource(`
      <rss version="2.0"><channel><title>Site fallback</title><link>https://site.example/news/</link>
        <item><title>Site article</title><guid>site-guid</guid>
          <link>story</link><description>Body</description></item>
      </channel></rss>
    `);

    expect(feed.entries[0]).toMatchObject({
      url: 'https://site.example/news/story',
      urlStatus: 'resolved'
    });
  });

  it.each(['javascript:alert(1)', 'data:text/html,unsafe', 'http://[malformed']) (
    'rejects unsafe or malformed entry URL %s without replacing the stable ID',
    link => {
      const feed = parseFeedSource(`
        <rss version="2.0"><channel><title>Unsafe links</title>
          <item><title>Unsafe article</title><guid isPermaLink="false">opaque-guid</guid>
            <link>${link}</link><description>Body</description></item>
        </channel></rss>
      `, { feedUrl: 'https://feeds.example.com/feed.xml' });

      expect(feed.entries[0]).toMatchObject({
        url: null,
        urlStatus: 'invalid',
        externalId: 'opaque-guid',
        externalIdType: 'guid'
      });
    }
  );

  it('distinguishes a missing external URL from an invalid declared URL', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom"><title>Linkless</title><id>feed-id</id>
        <entry><title>Linkless entry</title><id>entry-id</id><content>Body</content></entry>
      </feed>
    `, { feedUrl: 'https://feeds.example.com/feed.xml' });

    expect(feed.entries[0]).toMatchObject({
      url: null,
      urlStatus: 'missing',
      contentBaseUrl: 'https://feeds.example.com/feed.xml'
    });
  });

  it('uses entry xml:base as the content base for a linkless stable-ID entry', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom" xml:base="../feed-base/">
        <title>Linkless content base</title><id>feed-id</id>
        <entry xml:base="entries/42/">
          <title>Linkless entry</title><id>entry-id</id>
          <content type="html">&lt;p&gt;&lt;a href="inside"&gt;Inside&lt;/a&gt;&lt;/p&gt;</content>
        </entry>
      </feed>
    `, { feedUrl: 'https://feeds.example.com/news/feed.xml' });

    expect(feed.entries[0]).toMatchObject({
      url: null,
      contentBaseUrl: 'https://feeds.example.com/feed-base/entries/42/'
    });
  });

  it('prefers the resolved article URL as the content base', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://feeds.example.com/base/">
        <title>Article content base</title><id>feed-id</id>
        <entry xml:base="entries/">
          <title>Linked entry</title><id>entry-id</id>
          <link href="https://articles.example.com/posts/42" />
          <content>Body</content>
        </entry>
      </feed>
    `, { feedUrl: 'https://feeds.example.com/feed.xml' });

    expect(feed.entries[0].contentBaseUrl).toBe('https://articles.example.com/posts/42');
  });

  it('leaves relative URLs inside content for the content rewriting pipeline', () => {
    const feed = parseFeedSource(`
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel><title>Content links</title>
          <item><title>Content article</title><guid>content-guid</guid><link>/article</link>
            <content:encoded><![CDATA[<p><a href="/inside">Inside</a></p>]]></content:encoded>
          </item>
        </channel>
      </rss>
    `, { feedUrl: 'https://feeds.example.com/feed.xml' });

    expect(feed.entries[0]).toMatchObject({
      url: 'https://feeds.example.com/article',
      content: '<p><a href="/inside">Inside</a></p>'
    });
  });

  it('preserves Atom self declarations for resolution after the final fetch URL is known', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Relative self feed</title>
        <id>urn:feed:relative-self</id>
        <updated>2026-08-09T10:00:00Z</updated>
        <link rel="self" href="../canonical.xml" />
        <entry>
          <title>Stable entry</title>
          <id>entry-1</id>
          <updated>2026-08-09T10:00:00Z</updated>
        </entry>
      </feed>
    `);

    expect(feed.selfUrl).toBe('../canonical.xml');
  });

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
        descriptionKind: 'html',
        content: '<p>Article body</p>',
        contentKind: 'html',
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

  it('uses RSS date namespace precedence and keeps modification metadata separate', () => {
    const feed = parseFeedSource(`
      <rss version="2.0"
        xmlns:atom="http://www.w3.org/2005/Atom"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:dcterms="http://purl.org/dc/terms/">
        <channel>
          <title>RSS dates</title>
          <link>https://example.com</link>
          <description>RSS date precedence</description>
          <item>
            <title>RSS article</title>
            <link>https://example.com/rss-dates</link>
            <guid>rss-dates</guid>
            <pubDate>Wed, 15 Jul 2026 10:00:00 GMT</pubDate>
            <atom:published>2026-07-15T11:00:00Z</atom:published>
            <dc:date>2026-07-15T12:00:00Z</dc:date>
            <dcterms:date>2026-07-15T13:00:00Z</dcterms:date>
            <atom:updated>2026-07-15T14:00:00Z</atom:updated>
            <dcterms:modified>2026-07-15T15:00:00Z</dcterms:modified>
          </item>
        </channel>
      </rss>
    `);

    expect(feed.entries[0]).toMatchObject({
      publishedAt: '2026-07-15T10:00:00.000Z',
      modifiedAt: '2026-07-15T14:00:00.000Z'
    });
  });

  it('uses Atom published and updated before Dublin Core fallbacks', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:dcterms="http://purl.org/dc/terms/">
        <title>Atom dates</title>
        <id>https://example.com/atom</id>
        <updated>2026-07-15T09:00:00Z</updated>
        <entry>
          <title>Atom article</title>
          <id>atom-dates</id>
          <link href="https://example.com/atom-dates" />
          <published>2026-07-15T10:00:00Z</published>
          <updated>2026-07-15T11:00:00Z</updated>
          <dc:date>2026-07-15T12:00:00Z</dc:date>
          <dcterms:date>2026-07-15T13:00:00Z</dcterms:date>
          <dcterms:modified>2026-07-15T14:00:00Z</dcterms:modified>
        </entry>
      </feed>
    `);

    expect(feed.entries[0]).toMatchObject({
      publishedAt: '2026-07-15T10:00:00.000Z',
      modifiedAt: '2026-07-15T11:00:00.000Z'
    });
  });

  it('uses RDF Atom dates before repeated Dublin Core fallbacks', () => {
    const feed = parseFeedSource(`
      <rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns="http://purl.org/rss/1.0/"
        xmlns:atom="http://www.w3.org/2005/Atom"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:dcterms="http://purl.org/dc/terms/">
        <channel rdf:about="https://example.com/rdf">
          <title>RDF dates</title>
          <link>https://example.com</link>
          <description>RDF date precedence</description>
          <items>
            <rdf:Seq><rdf:li rdf:resource="https://example.com/rdf-dates" /></rdf:Seq>
          </items>
        </channel>
        <item rdf:about="https://example.com/rdf-dates">
          <title>RDF article</title>
          <link>https://example.com/rdf-dates</link>
          <atom:published>2026-07-15T10:00:00Z</atom:published>
          <atom:updated>2026-07-15T11:00:00Z</atom:updated>
          <dc:date>not-a-date</dc:date>
          <dc:date>2026-07-15T12:00:00Z</dc:date>
          <dcterms:date>not-a-date</dcterms:date>
          <dcterms:date>2026-07-15T13:00:00Z</dcterms:date>
          <dcterms:modified>2026-07-15T14:00:00Z</dcterms:modified>
        </item>
      </rdf:RDF>
    `);

    expect(feed.entries[0]).toMatchObject({
      publishedAt: '2026-07-15T10:00:00.000Z',
      modifiedAt: '2026-07-15T11:00:00.000Z'
    });
  });

  it('uses the first parseable repeated Dublin Core date', () => {
    const feed = parseFeedSource(`
      <rss version="2.0"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:dcterms="http://purl.org/dc/terms/">
        <channel>
          <title>Repeated dates</title>
          <link>https://example.com</link>
          <description>Repeated date fallback</description>
          <item>
            <title>DC article</title>
            <link>https://example.com/dc-dates</link>
            <guid>dc-dates</guid>
            <dc:date>not-a-date</dc:date>
            <dc:date>2026-07-15T12:00:00Z</dc:date>
            <dcterms:date>2026-07-15T13:00:00Z</dcterms:date>
          </item>
          <item>
            <title>DCTERMS article</title>
            <link>https://example.com/dcterms-dates</link>
            <guid>dcterms-dates</guid>
            <dcterms:date>not-a-date</dcterms:date>
            <dcterms:date>2026-07-16T13:00:00Z</dcterms:date>
          </item>
        </channel>
      </rss>
    `);

    expect(feed.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: 'dc-dates',
        publishedAt: '2026-07-15T12:00:00.000Z'
      }),
      expect.objectContaining({
        externalId: 'dcterms-dates',
        publishedAt: '2026-07-16T13:00:00.000Z'
      })
    ]));
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
        descriptionKind: 'text',
        content: '<p>JSON article body</p>',
        contentKind: 'html',
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
      contentKind: 'text',
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

  it('preserves Atom text, HTML, and XHTML text-construct semantics', () => {
    const feed = parseFeedSource(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom content kinds</title>
        <id>urn:feed:content-kinds</id>
        <updated>2026-08-09T10:00:00Z</updated>
        <entry>
          <title>Plain text</title><id>text</id><updated>2026-08-09T10:00:00Z</updated>
          <content type="text">2 &lt; 3 &amp; 4 &gt; 1</content>
          <summary type="text">Literal &lt;b&gt;summary&lt;/b&gt;</summary>
        </entry>
        <entry>
          <title>HTML</title><id>html</id><updated>2026-08-09T10:00:00Z</updated>
          <content type="html">&lt;p&gt;HTML body&lt;/p&gt;</content>
          <summary type="html">&lt;p&gt;HTML summary&lt;/p&gt;</summary>
        </entry>
        <entry>
          <title>XHTML</title><id>xhtml</id><updated>2026-08-09T10:00:00Z</updated>
          <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>XHTML body</p></div></content>
        </entry>
      </feed>
    `);

    expect(feed.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: 'text',
        content: '2 < 3 & 4 > 1',
        contentKind: 'text',
        description: 'Literal <b>summary</b>',
        descriptionKind: 'text'
      }),
      expect.objectContaining({
        externalId: 'html',
        content: '<p>HTML body</p>',
        contentKind: 'html',
        descriptionKind: 'html'
      }),
      expect.objectContaining({
        externalId: 'xhtml',
        contentKind: 'html'
      })
    ]));
  });
});
