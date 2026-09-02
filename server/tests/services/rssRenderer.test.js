import { describe, expect, it } from 'vitest';
import { parseStringPromise } from 'xml2js';
import { buildRssXml } from '../../services/rss/rssRenderer.js';

describe('shared RSS renderer', () => {
  it('renders valid RSS while preserving special characters and article metadata', async () => {
    const xml = buildRssXml([
      {
        id: 17,
        userId: 42,
        title: 'Security <News> & Analysis',
        url: 'https://example.test/article?a=1&b=2',
        publishedAt: '2026-09-02T10:30:00.000Z',
        contentHtml: '<p>One & two</p>',
        feed: { feedName: 'Research & Reports' }
      }
    ], {
      title: 'RSSMonster <Generated>',
      link: 'https://rssmonster.test/rss/generated/token',
      description: 'Selected security & privacy reporting',
      language: 'en'
    });
    const parsed = await parseStringPromise(xml);
    const channel = parsed.rss.channel[0];
    const item = channel.item[0];

    expect(parsed.rss.$.version).toBe('2.0');
    expect(parsed.rss.$['xmlns:atom']).toBe('http://www.w3.org/2005/Atom');
    expect(channel.title[0]).toBe('RSSMonster <Generated>');
    expect(channel.description[0]).toBe('Selected security & privacy reporting');
    expect(channel.language[0]).toBe('en');
    expect(item).toMatchObject({
      title: ['Security <News> & Analysis'],
      link: ['https://example.test/article?a=1&b=2'],
      description: ['<p>One &amp; two</p>'],
      category: ['Research & Reports']
    });
    expect(item.guid[0]).toMatchObject({
      _: 'https://rssmonster.test/rss/items/17',
      $: { isPermaLink: 'false' }
    });
    expect(channel['atom:link'][0].$).toEqual({
      href: 'https://rssmonster.test/rss/generated/token',
      rel: 'self',
      type: 'application/rss+xml'
    });
    expect(item.pubDate[0]).toBe('Wed, 02 Sep 2026 10:30:00 GMT');
  });

  it('uses established fallbacks for missing optional article fields', async () => {
    const xml = buildRssXml([{
      id: 18,
      userId: 42,
      title: '',
      createdAt: '2026-09-01T08:00:00.000Z',
      content: 'Plain fallback content'
    }], {
      title: 'Fallback feed',
      link: 'https://rssmonster.test',
      description: 'Fallbacks',
      language: 'en'
    });
    const item = (await parseStringPromise(xml)).rss.channel[0].item[0];

    expect(item.title[0]).toBe('No title');
    expect(item.description[0]).toBe('Plain fallback content');
    expect(item.pubDate[0]).toBe('Tue, 01 Sep 2026 08:00:00 GMT');
    expect(item.link).toBeUndefined();
    expect(item.category).toBeUndefined();
  });

  it('removes orphaned media sources from already-stored HTML descriptions', async () => {
    const xml = buildRssXml([{
      id: 19,
      userId: 42,
      title: 'Stored media markup',
      createdAt: '2026-09-01T08:00:00.000Z',
      contentHtml: '<p>Before<source src="https://example.test/video.mp4" type="video/mp4"></source>After</p>'
    }], {
      title: 'Normalized feed',
      link: 'https://rssmonster.test/rss/generated/token',
      description: 'Normalized descriptions',
      language: 'en'
    });
    const item = (await parseStringPromise(xml)).rss.channel[0].item[0];

    expect(item.description[0]).toBe('<p>BeforeAfter</p>');
    expect(xml).not.toContain('<source');
    expect(xml).not.toContain('</source>');
  });
});
