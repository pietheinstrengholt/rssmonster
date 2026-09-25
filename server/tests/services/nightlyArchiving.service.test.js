import { describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { runNightlyArchiving } from '../../services/nightlyArchiving.js';

async function fixture(settings, recentRead = false) {
  const user = await db.User.create({ username: `nightly-${Date.now()}-${Math.random()}`, password: 'test-password' });
  const category = await db.Category.create({ userId: user.id, name: 'Nightly' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Nightly', url: `https://example.com/${user.id}` });
  if (settings) await db.ArchivingSetting.create({ userId: user.id, ...settings });
  const articles = await db.Article.bulkCreate(['read', 'unread', 'read'].map((status, index) => {
    const date = recentRead && index === 2 ? new Date(Date.now() - 30 * 86400000) : new Date('2010-01-01T12:00:00Z');
    return {
      userId: user.id, feedId: feed.id, title: `Article ${index}`, url: `https://example.com/${user.id}/${index}`,
      status, publishedAt: date, createdAt: date
    };
  }));
  return { user, articles };
}

const remaining = userId => db.Article.count({ where: { userId } });

describe('nightly per-user archiving', () => {
  it('uses each user’s settings, applies defaults, logs counts including zero, and continues after user failures', async () => {
    const failed = await fixture({ neverDeleteUnreadArticles: false });
    const capped = await fixture({ neverDeleteUnreadArticles: false, maximumArticlesTotal: 1 });
    const defaulted = await fixture(undefined, true);
    const unchanged = await fixture({ maximumArticlesTotal: 10 });
    const logger = { log: vi.fn(), error: vi.fn() };
    const originalDestroy = db.Article.destroy;
    const failure = new Error('test deletion failure');
    const destroy = vi.spyOn(db.Article, 'destroy').mockImplementation(function (options) {
      if (options.where.userId === failed.user.id) throw failure;
      return originalDestroy.call(this, options);
    });
    try {
      await runNightlyArchiving({ logger });
      expect(await remaining(failed.user.id)).toBe(3);
      expect(await remaining(capped.user.id)).toBe(1);
      expect(await remaining(defaulted.user.id)).toBe(2);
      expect(await remaining(unchanged.user.id)).toBe(3);
      expect(logger.error).toHaveBeenCalledWith(`[Archiving] Failed user=${failed.user.id}:`, failure);
      expect(logger.log).toHaveBeenCalledWith(`[Archiving] Completed user=${capped.user.id}: removed 2 articles.`);
      expect(logger.log).toHaveBeenCalledWith(`[Archiving] Completed user=${defaulted.user.id}: removed 1 articles.`);
      expect(logger.log).toHaveBeenCalledWith(`[Archiving] Completed user=${unchanged.user.id}: removed 0 articles.`);
    } finally { destroy.mockRestore(); }
  });

  it('leaves articles untouched when shutdown was requested', async () => {
    const { user } = await fixture({ neverDeleteUnreadArticles: false });
    const logger = { log: vi.fn(), error: vi.fn() };
    await runNightlyArchiving({ logger, shouldStop: () => true });
    expect(await remaining(user.id)).toBe(3);
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('finishes the current user and stops before the next user on shutdown', async () => {
    const finished = await fixture({ neverDeleteUnreadArticles: false });
    const skipped = await fixture({ neverDeleteUnreadArticles: false });
    let stopping = false;
    const logger = {
      log: message => { if (message.includes(`user=${finished.user.id}:`)) stopping = true; },
      error: vi.fn()
    };
    await runNightlyArchiving({ logger, shouldStop: () => stopping });
    expect(await remaining(finished.user.id)).toBe(0);
    expect(await remaining(skipped.user.id)).toBe(3);
  });
});
