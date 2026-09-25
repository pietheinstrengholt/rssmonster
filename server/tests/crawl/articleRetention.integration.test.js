import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';
import { cleanupArticles } from '../../services/articleCleanup.js';
import processArticle from '../../services/crawl/orchestration/processArticle.js';

const mocked = vi.hoisted(() => ({ acquireFeed: vi.fn() }));
vi.mock('../../services/feeds/feedAcquisition.js', () => ({ acquireFeed: mocked.acquireFeed }));
const { default: crawl } = await import('../../controllers/crawl.js');
const users = [];
const old = '2010-01-01T00:00:00Z';
const entry = (id, publishedAt, title = id) => parseFeedSource(`<rss version="2.0"><channel>
  <title>Retention</title><item><guid>${id}</guid><link>https://retention.test/${id}</link>
  <title>${title}</title>${publishedAt ? `<pubDate>${publishedAt}</pubDate>` : ''}
  </item></channel></rss>`).entries[0];

async function fixture({ established = true, years = 5 } = {}) {
  const user = await db.User.create({ username: `retention-${Date.now()}-${Math.random()}`, password: 'test-password' });
  users.push(user.id);
  const category = await db.Category.create({ userId: user.id, name: 'Retention' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id,
    feedName: 'Retention', url: `https://retention.test/${user.id}.xml`, applyAiAnalysis: false,
    lastSuccessAt: established ? new Date('2026-01-01') : null });
  await db.ArchivingSetting.create({ userId: user.id, maximumArticleAge: years,
    neverDeleteUnreadArticles: false });
  return { user, feed };
}
async function run(owner, entries) {
  // Ensure same-second test crawls record a changed attempt, as in authentication tests.
  await db.Feed.update({ lastAttemptAt: null }, { where: { id: owner.feed.id } });
  mocked.acquireFeed.mockImplementation(async ({ feed }) => ({ type: 'changed', url: feed.url,
    parsedFeed: { format: 'rss', title: 'Retention', entries } }));
  await crawl.performCrawl(owner.user.id, { feedId: owner.feed.id });
  return db.FeedCrawlResult.findOne({ where: { feedId: owner.feed.id }, order: [['id', 'DESC']] });
}
const stored = owner => db.Article.findAll({ where: { feedId: owner.feed.id }, order: [['id', 'ASC']] });
afterEach(async () => {
  await db.User.destroy({ where: { id: users.splice(0) } });
});

describe('article retention at ingestion', () => {
  it('filters unseen old entries but keeps recent and undated title-only articles', async () => {
    const owner = await fixture();
    const result = await run(owner, [entry('old', old), entry('recent', new Date().toUTCString()), entry('undated')]);
    expect(result).toMatchObject({ status: 'SUCCESS', articlesNew: 2, articlesFiltered: 1 });
    expect((await stored(owner)).map(a => a.title)).toEqual(['recent', 'undated']);
  });

  it('preserves initial historical imports, then blocks their return after cleanup', async () => {
    const owner = await fixture({ established: false });
    expect(await run(owner, [entry('historical', old)])).toMatchObject({ articlesNew: 1 });
    expect(await cleanupArticles(owner.user.id)).toBe(1);
    expect(await stored(owner)).toHaveLength(0);
    expect(await run(owner, [entry('historical', old)])).toMatchObject({ articlesNew: 0, articlesFiltered: 1 });
    expect(await stored(owner)).toHaveLength(0);
  });

  it('updates existing old articles without resetting their state', async () => {
    const owner = await fixture({ established: false });
    await run(owner, [entry('revision', old)]);
    const [article] = await stored(owner);
    await article.update({ status: 'read', favoriteInd: 1 });
    expect(await run(owner, [entry('revision', old, 'Revised title')])).toMatchObject({ articlesNew: 0, articlesUpdated: 1, articlesFiltered: 0 });
    expect(await article.reload()).toMatchObject({ title: 'Revised title', status: 'read', favoriteInd: 1 });
  });

  it('uses each owner’s age setting even when count limits are configured', async () => {
    const short = await fixture({ years: 1 });
    const long = await fixture({ years: 20 });
    await db.ArchivingSetting.update({ maximumArticlesTotal: 100 }, { where: { userId: short.user.id } });
    expect(await run(short, [entry('shared', old)])).toMatchObject({ articlesNew: 0, articlesFiltered: 1 });
    expect(await run(long, [entry('shared', old)])).toMatchObject({ articlesNew: 1, articlesFiltered: 0 });
  });

  it('applies default retention and recognizes prior receipts without a fetch timestamp', async () => {
    const owner = await fixture({ established: false });
    await db.ArchivingSetting.destroy({ where: { userId: owner.user.id } });
    await owner.feed.update({ lastArticleReceivedAt: new Date() });
    expect(await run(owner, [entry('default-old', old)])).toMatchObject({ articlesNew: 0, articlesFiltered: 1 });
  });

  it('accepts the exact cutoff and rejects the second before it', async () => {
    const owner = await fixture();
    const cutoff = new Date('2021-09-25T00:00:00Z');
    const process = value => processArticle(owner.feed, value, [], null, null, null, null, null, 'rss', { articleRetentionCutoff: cutoff });
    expect(await process(entry('before', '2021-09-24T23:59:59Z'))).toMatchObject({ newArticles: 0, filteredArticles: 1 });
    expect(await process(entry('boundary', cutoff.toUTCString()))).toMatchObject({ newArticles: 1, errors: 0 });
  });
});
