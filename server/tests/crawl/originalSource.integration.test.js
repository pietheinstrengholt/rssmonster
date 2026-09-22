import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';
import buildArticleCandidate from '../../services/crawl/orchestration/buildArticleCandidate.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import updateArticle, { applyArticleUpdate } from '../../services/crawl/persistence/updateArticle.js';

const rss = metadata => `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Syndicator</title><item><guid isPermaLink="false">42</guid><description>Article body</description>${metadata}</item></channel></rss>`;
const parse = source => parseFeedSource(source, { feedUrl: 'https://syndicator.test/feed.xml' }).entries[0];

describe('original source normalization', () => {
  it('preserves RSS source attribution separately from the entry identity', () => {
    expect(parse(rss('<source url="https://agency.test/feed">Agency</source>'))).toMatchObject({
      externalId: '42', externalIdType: 'guid', url: null,
      originalSource: { title: 'Agency', id: null, url: 'https://agency.test/feed' }
    });
  });
  it('maps Atom source title, opaque ID and alternate link ahead of self', () => {
    const source = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>42</id><summary>Body</summary><source><title type="html">The &lt;b&gt;Agency&lt;/b&gt;</title><id>urn:agency:1</id><link rel="self" href="https://agency.test/feed"/><link rel="alternate" href="https://agency.test/"/></source></entry></feed>';
    expect(parse(source).originalSource).toEqual({ title: 'The Agency', id: 'urn:agency:1', url: 'https://agency.test/' });
  });
  it('supports namespaced Atom sources and relative source links', () => {
    expect(parse(rss('<atom:source><atom:title>Agency</atom:title><atom:id>urn:agency</atom:id><atom:link rel="alternate" href="/agency"/></atom:source>')).originalSource)
      .toEqual({ title: 'Agency', id: 'urn:agency', url: 'https://syndicator.test/agency' });
  });
  it('retains Dublin Core source identifiers without inventing links from text', () => {
    expect(parse(rss('<dc:source>Agency archive 42</dc:source>')).originalSource)
      .toEqual({ title: null, id: 'Agency archive 42', url: null });
  });
  it('maps RDF source references', () => {
    const source = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel rdf:about="https://syndicator.test/feed"/><item rdf:about="42"><description>Body</description><dc:source>https://agency.test/story</dc:source></item></rdf:RDF>';
    expect(parse(source).originalSource).toEqual({ title: null, id: 'https://agency.test/story', url: 'https://agency.test/story' });
  });
  it('rejects unsafe source links while preserving attribution text', () => {
    expect(parse(rss('<source url="javascript:alert(1)">Agency</source>')).originalSource)
      .toEqual({ title: 'Agency', id: null, url: null });
  });
  it('does not infer provenance from a JSON related URL or current publisher', () => {
    expect(parse(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: 'Publisher', items: [{ id: '42', content_text: 'Body', external_url: 'https://related.test/' }] })).originalSource).toBeNull();
    expect(parse(rss('')).originalSource).toBeNull();
  });
});

describe('original source persistence', () => {
  let user;
  let feed;
  beforeAll(async () => {
    const username = `original-source-${Date.now()}@example.test`;
    user = await db.User.create({ username, password: 'test-password', feverCredentialHash: username });
    const category = await db.Category.create({ userId: user.id, name: 'Original sources' });
    feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Syndicator', url: 'https://syndicator.test/feed.xml' });
  });
  afterAll(async () => { if (user) await user.destroy(); });
  it('updates attribution without changing identity, user state or content, and retains missing provenance', async () => {
    const candidate = async source => (await buildArticleCandidate({ feed, entry: parse(rss(source)) })).articleData;
    const initial = await candidate('<source url="https://agency.test/feed">Agency</source>');
    const { article } = await saveArticle(feed, initial, { tags: [] }, { status: 'read', favoriteInd: 1 });
    expect((await article.reload()).originalSource).toEqual(initial.originalSource);
    const revised = await candidate('<source url="https://agency.test/new">New agency name</source>');
    const plan = await updateArticle(feed, revised);
    expect(plan).toMatchObject({ matched: true, changed: true, changes: { contentChanged: false, metadataChanged: true } });
    await applyArticleUpdate({ updatePlan: plan, userId: user.id });
    expect(await article.reload()).toMatchObject({ id: article.id, externalId: '42', status: 'read', favoriteInd: 1, originalSource: revised.originalSource });
    expect(await updateArticle(feed, revised)).toMatchObject({ changed: false });
    expect(await updateArticle(feed, await candidate(''))).toMatchObject({ changed: false });
  });
});
