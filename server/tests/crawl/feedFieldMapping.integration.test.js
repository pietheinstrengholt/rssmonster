import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '../../models/index.js';
import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';
import buildArticleCandidate from '../../services/crawl/orchestration/buildArticleCandidate.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import updateArticle, { applyArticleUpdate } from '../../services/crawl/persistence/updateArticle.js';

const namespaces = 'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dc="http://purl.org/dc/elements/1.1/"';
const wrapEntry = (format, metadata) => {
  const fields = `<title>Old article</title>${metadata}`;
  if (format === 'atom') {
    return `<feed xmlns="http://www.w3.org/2005/Atom" ${namespaces}>
      <title>Feed</title><updated>2026-09-21T10:00:00Z</updated>
      <entry><id>stable-42</id><summary>Article summary</summary>${fields}</entry></feed>`;
  }
  if (format === 'rdf') {
    return `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
      xmlns="http://purl.org/rss/1.0/" ${namespaces}>
      <channel rdf:about="https://example.com/feed"><title>Feed</title></channel>
      <item rdf:about="https://example.com/stable/42"><description>Article summary</description>
        ${fields}</item></rdf:RDF>`;
  }
  return `<rss version="2.0" ${namespaces}><channel><title>Feed</title>
    <lastBuildDate>Mon, 21 Sep 2026 10:00:00 GMT</lastBuildDate>
    <item><guid isPermaLink="false">stable-42</guid><description>Article summary</description>
      ${fields}</item></channel></rss>`;
};

describe('feed publication field mapping', () => {
  it.each(['rss', 'atom', 'rdf'])('uses issued then created before update/feed dates in %s', async format => {
    for (const field of ['issued', 'created']) {
      const parsed = parseFeedSource(wrapEntry(format, `
        <dcterms:${field}>invalid</dcterms:${field}>
        <dcterms:${field}>2001-01-02T00:00:00Z</dcterms:${field}>
        ${field === 'issued' ? '<dcterms:created>2000-01-01T00:00:00Z</dcterms:created>' : ''}
        <dcterms:modified>2026-09-21T10:00:00Z</dcterms:modified>`));
      const candidate = await buildArticleCandidate({
        feed: { id: 7, userId: 42, feedName: 'Dates' },
        entry: parsed.entries[0],
        feedPublishedFallback: parsed.publishedAt
      });

      expect(candidate.articleData).toMatchObject({
        publishedAt: '2001-01-02T00:00:00.000Z',
        modifiedAt: '2026-09-21T10:00:00.000Z',
        publishInferred: false
      });
    }
  });

  it.each(['rss', 'atom', 'rdf'])('preserves existing publication-date precedence in %s', format => {
    const nativeDate = format === 'rss'
      ? '<pubDate>Thu, 15 Jul 2021 10:00:00 GMT</pubDate>'
      : format === 'atom'
        ? '<published>2021-07-15T10:00:00Z</published>'
        : '<dc:date>2021-07-15T10:00:00Z</dc:date>';
    const parsed = parseFeedSource(wrapEntry(format, `${nativeDate}
      <dcterms:issued>2020-01-01T00:00:00Z</dcterms:issued>
      <dcterms:created>2019-01-01T00:00:00Z</dcterms:created>`));

    expect(parsed.entries[0].publishedAt).toBe('2021-07-15T10:00:00.000Z');
  });

  it('falls back to created when every issued value is invalid', () => {
    const parsed = parseFeedSource(wrapEntry('rss', `
      <dcterms:issued>invalid</dcterms:issued>
      <dcterms:created>2001-01-02T00:00:00Z</dcterms:created>`));

    expect(parsed.entries[0].publishedAt).toBe('2001-01-02T00:00:00.000Z');
  });
});

describe('RDF identity persistence', () => {
  let user;
  let feed;

  beforeAll(async () => {
    const username = `rdf-identity-${Date.now()}@example.test`;
    user = await db.User.create({ username, password: 'test-password', feverCredentialHash: username });
    const category = await db.Category.create({ userId: user.id, name: 'RDF identity' });
    feed = await db.Feed.create({
      userId: user.id, categoryId: category.id, feedName: 'RDF feed',
      url: 'https://example.com/identity.rdf'
    });
  });

  afterAll(async () => {
    if (user) await user.destroy();
  });

  it('upgrades a URL identity in place and matches later URL revisions without resetting user state', async () => {
    const candidateFor = async path => {
      const parsed = parseFeedSource(wrapEntry('rdf', `<link>https://example.com/${path}</link>
        <dc:date>2021-07-15T10:00:00Z</dc:date>`));
      return buildArticleCandidate({ feed, entry: parsed.entries[0] });
    };
    const original = await candidateFor('old-slug');
    const saved = await saveArticle(feed, {
      ...original.articleData,
      externalId: original.articleData.normalizedUrl,
      externalIdType: 'normalized-url'
    }, { tags: [] }, { status: 'read', favoriteInd: 1, clickedAmount: 2 });
    const originalId = saved.article.id;

    const upgrade = await updateArticle(feed, original.articleData);
    expect(upgrade).toMatchObject({
      matched: true, article: { id: originalId },
      changes: { identityChanged: true },
      updateValues: { externalId: 'https://example.com/stable/42', externalIdType: 'rdf-about' }
    });
    await applyArticleUpdate({ updatePlan: upgrade, userId: feed.userId });

    const revised = await candidateFor('new-slug');
    const revision = await updateArticle(feed, revised.articleData);
    expect(revision).toMatchObject({ matched: true, article: { id: originalId }, changes: { urlChanged: true } });
    await applyArticleUpdate({ updatePlan: revision, userId: feed.userId });

    const stored = await db.Article.findByPk(originalId);
    expect(stored).toMatchObject({
      externalId: 'https://example.com/stable/42', externalIdType: 'rdf-about',
      url: 'https://example.com/new-slug', status: 'read', favoriteInd: 1, clickedAmount: 2
    });
    expect(await db.Article.count({ where: { feedId: feed.id } })).toBe(1);
    expect(await updateArticle(feed, revised.articleData)).toMatchObject({ matched: true, changed: false });
    expect(await updateArticle({ id: feed.id, userId: user.id + 1 }, revised.articleData))
      .toMatchObject({ matched: false });
  });
});
