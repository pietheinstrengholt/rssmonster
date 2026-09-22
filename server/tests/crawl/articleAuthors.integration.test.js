import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';
import buildArticleCandidate from '../../services/crawl/orchestration/buildArticleCandidate.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import updateArticle, { applyArticleUpdate } from '../../services/crawl/persistence/updateArticle.js';
import { compileItemFilter } from '../../services/crawl/filtering/itemFilter.js';

const parse = source => parseFeedSource(source, { feedUrl: 'https://publisher.test/feed' }).entries[0];
const rss = metadata => `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><channel><item><guid isPermaLink="false">42</guid><description>Article body</description>${metadata}</item></channel></rss>`;
const json = (authors, feedAuthors) => JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: 'Feed', authors: feedAuthors, items: [{ id: '42', content_text: 'Article body', authors }] });
const people = [{ name: 'Alice', url: 'https://publisher.test/alice' }, { name: 'Bob', url: 'https://publisher.test/bob' }];

describe('canonical authors', () => {
  it('keeps all JSON authors, resolves profiles and removes exact duplicates', () => {
    const entry = parse(json([{ name: 'Alice', url: '/alice' }, { name: 'Bob', url: '/bob' }, { name: 'Alice', url: '/alice' }]));
    expect(entry).toMatchObject({ authors: people, author: 'Alice, Bob' });
  });
  it('preserves all RSS person names and profile links', () => {
    const entry = parse(rss('<author>Alice (https://publisher.test/alice)</author><author>Bob (https://publisher.test/bob)</author>'));
    expect(entry).toMatchObject({ authors: people, author: 'Alice, Bob' });
  });
  it('preserves Atom people with URI profile links', () => {
    const entry = parse('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>42</id><author><name>Alice</name><uri>/alice</uri></author><author><name>Bob</name><uri>/bob</uri></author></entry></feed>');
    expect(entry).toMatchObject({ authors: people, author: 'Alice, Bob' });
  });
  it('preserves repeated RDF creators', () => {
    const entry = parse('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel rdf:about="https://publisher.test/feed"/><item rdf:about="42"><dc:creator>Alice</dc:creator><dc:creator>Bob</dc:creator></item></rdf:RDF>');
    expect(entry.authors).toEqual([{ name: 'Alice', url: null }, { name: 'Bob', url: null }]);
  });
  it.each(['dc', 'dcterms'])('preserves %s creators without splitting commas inside names', ns => {
    expect(parse(rss(`<${ns}:creator>Smith, Alice</${ns}:creator><${ns}:creator>Bob</${ns}:creator>`)).authors)
      .toEqual([{ name: 'Smith, Alice', url: null }, { name: 'Bob', url: null }]);
  });
  it('inherits all JSON feed authors only when item authors are absent', () => {
    expect(parse(json(undefined, people)).authors).toEqual(people);
    expect(parse(json([{ name: 'Carol' }], people)).authors).toEqual([{ name: 'Carol', url: null }]);
  });
  it('inherits Atom source authors and keeps feed-relative URLs in feed scope', () => {
    const prefix = '<feed xmlns="http://www.w3.org/2005/Atom"><author><name>Alice</name><uri>alice</uri></author><author><name>Bob</name><uri>bob</uri></author><entry xml:base="https://other.test/items/"><id>42</id>';
    expect(parse(`${prefix}</entry></feed>`).authors).toEqual(people);
    expect(parse(`${prefix}<source><author><name>Carol</name></author><author><name>Dan</name></author></source></entry></feed>`).author).toBe('Carol, Dan');
  });
  it('retains URL-only authors and rejects unsafe profile URLs', () => {
    expect(parse(json([{ url: 'https://publisher.test/anonymous' }, { name: 'Bob', url: 'javascript:alert(1)' }])).authors)
      .toEqual([{ name: null, url: 'https://publisher.test/anonymous' }, { name: 'Bob', url: null }]);
  });
  it('matches secondary authors in feed item filtering', async () => {
    const candidate = await buildArticleCandidate({
      feed: { id: 7, userId: 42, feedName: 'Authors' }, entry: parse(json(people)),
      compiledItemFilter: compileItemFilter('author:/Bob/')
    });
    expect(candidate.articleData.authors).toEqual(people);
  });
});

describe('author persistence and filtering', () => {
  let user;
  let feed;
  beforeAll(async () => {
    const username = `authors-${Date.now()}@example.test`;
    user = await db.User.create({ username, password: 'test-password', feverCredentialHash: username });
    const category = await db.Category.create({ userId: user.id, name: 'Authors' });
    feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Authors', url: 'https://publisher.test/feed' });
  });
  afterAll(async () => { if (user) await user.destroy(); });
  it('keeps structured and searchable bylines synchronized during revisions', async () => {
    const candidate = async authors => (await buildArticleCandidate({ feed, entry: parse(json(authors)) })).articleData;
    const initial = await candidate(people);
    const { article } = await saveArticle(feed, initial, { tags: [] }, { status: 'read', favoriteInd: 1 });
    expect(await article.reload()).toMatchObject({ authors: people, author: 'Alice, Bob' });
    expect(await db.Article.count({ where: { userId: user.id, author: { [Op.like]: '%Bob%' } } })).toBe(1);
    const revised = await candidate([{ name: 'Carol', url: 'https://publisher.test/carol' }]);
    const plan = await updateArticle(feed, revised);
    expect(plan.changes).toMatchObject({ authorChanged: true, contentChanged: false });
    await applyArticleUpdate({ updatePlan: plan, userId: user.id });
    expect(await article.reload()).toMatchObject({ authors: revised.authors, author: 'Carol', status: 'read', favoriteInd: 1 });
    expect(await updateArticle(feed, revised)).toMatchObject({ changed: false });
    expect(await updateArticle(feed, await candidate(undefined))).toMatchObject({ changed: false });
    expect(await db.Article.count({ where: { userId: user.id, author: { [Op.like]: '%Bob%' } } })).toBe(0);
  });
});
