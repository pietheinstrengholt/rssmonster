import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import updateArticle, { applyArticleUpdate } from '../../services/crawl/persistence/updateArticle.js';

const { User, Category, Feed, Article } = db;
const oldDate = new Date('2025-01-01T00:00:00Z');
const data = suffix => ({
  link: `https://receipt.test/${suffix}`,
  normalizedUrl: `https://receipt.test/${suffix}`,
  title: suffix,
  contentOriginal: '<p>Original content</p>',
  contentHtml: '<p>Original content</p>',
  contentText: 'Original content',
  contentTextHash: 'receipt-text',
  contentSourceHash: 'receipt-source',
  publishedAt: oldDate
});

describe('Feed article receipt activity', () => {
  let user;
  let category;
  let sequence = 0;
  const createFeed = () => Feed.create({
    userId: user.id, categoryId: category.id,
    feedName: 'Receipt feed', url: `https://receipt.test/feed-${++sequence}`,
    lastArticleReceivedAt: oldDate
  });
  beforeAll(async () => {
    user = await User.create({ username: `receipt-${Date.now()}`, password: 'test-password' });
    category = await Category.create({ userId: user.id, name: 'Receipt activity' });
  });
  afterAll(async () => { await user?.destroy(); });

  it('advances on new stored articles regardless of publisher age or filtering, and survives cleanup', async () => {
    const feed = await createFeed();
    const other = await createFeed();
    const before = Math.floor(Date.now() / 1000) * 1000;
    const result = await saveArticle(feed, data('old-publication'), { tags: [] }, { status: 'unread', shouldDiscard: true });
    expect(result.created).toBe(true);
    expect((await feed.reload()).lastArticleReceivedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect((await other.reload()).lastArticleReceivedAt).toEqual(oldDate);
    const receipt = feed.lastArticleReceivedAt;
    await result.article.destroy();
    expect((await feed.reload()).lastArticleReceivedAt).toEqual(receipt);
  });

  it('does not advance for revisions, duplicate retries, or crawl-only metadata', async () => {
    const feed = await createFeed();
    const candidate = data('revision');
    const { article } = await saveArticle(feed, candidate, { tags: [] }, { status: 'unread' });
    await feed.reload();
    await feed.update({ lastArticleReceivedAt: oldDate });
    const retry = await saveArticle(feed, candidate, { tags: [] }, { status: 'unread' });
    expect(retry.created).toBe(false);
    const plan = await updateArticle(feed, { ...candidate, title: 'Revised title' }, { article });
    await applyArticleUpdate({ updatePlan: plan, userId: user.id });
    await feed.update({ lastFetched: new Date(), lastSuccessAt: new Date() });
    expect((await feed.reload()).lastArticleReceivedAt).toEqual(oldDate);
  });

  it('rolls back receipt activity with a failed article transaction', async () => {
    const feed = await createFeed();
    Feed.addHook('afterBulkUpdate', 'receipt-rollback-test', () => { throw new Error('Receipt transaction failed'); });
    try {
      await expect(saveArticle(feed, data('rollback'), { tags: [] }, { status: 'unread' })).rejects.toThrow('Receipt transaction failed');
    } finally {
      Feed.removeHook('afterBulkUpdate', 'receipt-rollback-test');
    }
    expect(await Article.count({ where: { feedId: feed.id } })).toBe(0);
    expect((await feed.reload()).lastArticleReceivedAt).toEqual(oldDate);
  });
});
