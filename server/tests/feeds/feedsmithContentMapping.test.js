import { describe, expect, it } from 'vitest';
import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';
import buildArticleCandidate from '../../services/crawl/orchestration/buildArticleCandidate.js';

const atom = (entry, metadata = '') => `<feed xmlns="http://www.w3.org/2005/Atom">
  <id>feed</id><title>Feed</title>${metadata}<entry><id>entry-42</id>${entry}</entry></feed>`;
const rss = (entry, metadata = '') => `<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>${metadata}<item><guid isPermaLink="false">entry-42</guid>${entry}</item></channel></rss>`;
const parse = source => parseFeedSource(source, { feedUrl: 'https://example.com/feeds/main.xml' });
const candidate = async source => buildArticleCandidate({
  feed: { id: 7, userId: 42, feedName: 'Mapping test' },
  entry: parse(source).entries[0]
});

describe('feed content mapping', () => {
  it.each([
    ['audio/mpeg', 'audio', 'episode.mp3'],
    ['video/mp4', 'video', 'episode.mp4']
  ])('keeps an Atom entry containing only a %s enclosure', async (mime, type, file) => {
    const source = atom(`<title>Episode</title>
      <link rel="enclosure" href="${file}" type="${mime}" length="500"/>`);
    expect(parse(source).entries[0]).toMatchObject({
      url: null,
      media: { type, url: `https://example.com/feeds/${file}`, mimeType: mime, fileSize: 500 }
    });
    expect((await candidate(source)).articleData.media.type).toBe(type);
  });

  it('maps Atom image enclosures while keeping the alternate article link', () => {
    const entry = parse(atom(`<title>Image</title><link rel="enclosure"
      href="https://cdn.example.com/photo.jpg" type="image/jpeg"/>
      <link rel="alternate" href="https://example.com/story"/>`)).entries[0];
    expect(entry.url).toBe('https://example.com/story');
    expect(entry.imageCandidates).toContainEqual(expect.objectContaining({
      url: 'https://cdn.example.com/photo.jpg', source: 'enclosure', mimeType: 'image/jpeg'
    }));
  });

  it('maps namespaced Atom enclosures in RSS', () => {
    const entry = parse(rss(`<title>Episode</title><atom:link rel="enclosure"
      href="https://example.com/episode.mp3" type="audio/mpeg"/>`)).entries[0];
    expect(entry).toMatchObject({ url: null, media: { type: 'audio', url: 'https://example.com/episode.mp3' } });
  });

  it('uses namespaced Atom body content without overriding RSS encoded content', async () => {
    const body = '<atom:content type="html">&lt;p&gt;Atom body&lt;/p&gt;</atom:content>';
    expect((await candidate(rss(`<title>Entry</title>${body}`))).articleData.contentText).toBe('Atom body');
    expect(parse(rss(`<content:encoded><![CDATA[<p>RSS body</p>]]></content:encoded>${body}`))
      .entries[0].content).toBe('<p>RSS body</p>');
  });

  it.each(['dc', 'dcterms'])('uses %s text metadata as fallbacks and imports its categories', async ns => {
    const metadata = `<${ns}:title>Namespace title</${ns}:title>
      <${ns}:description>Namespace description</${ns}:description>`;
    const source = rss(`${metadata}<${ns}:creator>Namespace author</${ns}:creator>
      <${ns}:subject>News</${ns}:subject><${ns}:subject>News</${ns}:subject>`, metadata);
    const parsed = parse(source);
    expect(parsed).toMatchObject({ title: 'Namespace title', description: 'Namespace description' });
    expect(parsed.entries[0]).toMatchObject({
      title: 'Namespace title', description: 'Namespace description',
      descriptionKind: 'text', author: 'Namespace author', categories: ['News']
    });
    expect((await candidate(source)).articleData.contentText).toBe('Namespace description');
    expect(parse(rss(`<title>Native title</title><description>Native description</description>${metadata}`))
      .entries[0]).toMatchObject({ title: 'Native title', description: 'Native description' });
  });

  it('inherits Atom source and feed authors, with entry authors taking precedence', () => {
    const feedAuthor = '<author><name>Feed author</name></author>';
    const sourceAuthor = '<source><author><name>Source author</name></author></source>';
    expect(parse(atom('<summary>Body</summary>', feedAuthor)).entries[0].author).toBe('Feed author');
    expect(parse(atom(sourceAuthor, feedAuthor)).entries[0].author).toBe('Source author');
    expect(parse(atom(`<author><name>Entry author</name></author>${sourceAuthor}`, feedAuthor))
      .entries[0].author).toBe('Entry author');
  });

  it('inherits JSON authors only when item authors are absent', () => {
    const parsed = parse(JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1', title: 'JSON', authors: [{ name: 'Feed author' }],
      items: [
        { id: '1', content_text: 'Body' },
        { id: '2', content_text: 'Body', authors: [{ name: 'Entry author' }] },
        { id: '3', content_text: 'Body', authors: [{ url: 'https://example.com/author' }] }
      ]
    }));
    expect(parsed.entries.map(entry => entry.author)).toEqual(['Feed author', 'Entry author', null]);
  });

  it.each([
    ['html', 'A &lt;em&gt;formatted&lt;/em&gt; title', 'A formatted title'],
    ['xhtml', '<div xmlns="http://www.w3.org/1999/xhtml">A <em>formatted</em> title</div>', 'A formatted title'],
    ['text', 'A &lt;em&gt;literal&lt;/em&gt; title', 'A <em>literal</em> title']
  ])('normalizes %s titles for text display without changing plain-text semantics', (type, title, expected) => {
    expect(parse(atom(`<title type="${type}">${title}</title>`)).entries[0].title).toBe(expected);
  });

  it('normalizes formatted Atom feed titles and subtitles', () => {
    const parsed = parse(`<feed xmlns="http://www.w3.org/2005/Atom">
      <title type="html">A &lt;b&gt;feed&lt;/b&gt;</title>
      <subtitle type="html">A &lt;i&gt;description&lt;/i&gt;</subtitle></feed>`);
    expect(parsed).toMatchObject({ title: 'A feed', description: 'A description' });
  });

  it.each(['html', 'plain'])('preserves Media RSS %s description semantics', async type => {
    const source = rss(`<title>Media</title><media:group>
      <media:description type="${type}">&lt;p&gt;Synopsis&lt;/p&gt;</media:description></media:group>`);
    const result = await candidate(source);
    expect(result.articleData.description).toBe('<p>Synopsis</p>');
    expect(result.articleData.contentText).toBe(type === 'html' ? 'Synopsis' : '<p>Synopsis</p>');
  });

  it('maps podcast artwork and author without overriding a native author', () => {
    const metadata = '<itunes:image href="https://example.com/art.jpg"/><itunes:author>Podcaster</itunes:author>';
    const entry = parse(rss(`<title>Episode</title>${metadata}`, metadata)).entries[0];
    expect(entry.author).toBe('Podcaster');
    expect(entry.imageCandidates).toContainEqual(expect.objectContaining({ url: 'https://example.com/art.jpg', source: 'publisher' }));
    expect(parse(rss('', metadata)).faviconUrl).toBe('https://example.com/art.jpg');
    expect(parse(rss(`<author>Native author</author>${metadata}`)).entries[0].author).toBe('Native author');
  });

  it.each(['rss', 'rdf'])('preserves the namespaced publisher self declaration in %s', format => {
    const self = '<atom:link rel="self" href="../canonical.xml"/>';
    const source = format === 'rss' ? rss('', self) : `<rdf:RDF
      xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"
      xmlns:atom="http://www.w3.org/2005/Atom"><channel rdf:about="https://example.com/feed">
      <title>Feed</title>${self}</channel></rdf:RDF>`;
    expect(parse(source).selfUrl).toBe('../canonical.xml');
  });

  it('resolves body and summary bases independently and preserves raw source', async () => {
    const source = `<feed xmlns="http://www.w3.org/2005/Atom" xml:base="../assets/">
      <title>Feed</title><entry xml:base="entries/"><id>42</id><title>Entry</title>
      <link href="https://articles.example.com/story"/>
      <content type="html" xml:base="body/">&lt;p&gt;&lt;a href="details"&gt;Body&lt;/a&gt;&lt;/p&gt;</content>
      <summary type="html" xml:base="summary/">&lt;p&gt;&lt;a href="details"&gt;Summary&lt;/a&gt;&lt;img src="photo.jpg" width="1200" height="800"/&gt;&lt;/p&gt;</summary>
      <link rel="enclosure" href="episode.mp3" type="audio/mpeg"/>
      </entry></feed>`;
    const entry = parse(source).entries[0];
    expect(entry).toMatchObject({
      url: 'https://articles.example.com/story',
      contentBaseUrl: 'https://example.com/assets/entries/body/',
      descriptionBaseUrl: 'https://example.com/assets/entries/summary/',
      media: { url: 'https://articles.example.com/episode.mp3' }
    });
    const result = (await candidate(source)).articleData;
    expect(result.contentOriginal).toBe('<p><a href="details">Body</a></p>');
    expect(result.contentHtml).toContain('https://example.com/assets/entries/body/details');
    expect(result.descriptionHtml).toContain('https://example.com/assets/entries/summary/details');
  });

  it('honors a base on namespaced Atom content in RSS', async () => {
    const source = rss(`<title>Entry</title><atom:content type="html" xml:base="https://cdn.example.com/">
      &lt;p&gt;&lt;a href="details"&gt;Body&lt;/a&gt;&lt;/p&gt;</atom:content>`);
    expect((await candidate(source)).articleData.contentHtml).toContain('https://cdn.example.com/details');
  });
});
