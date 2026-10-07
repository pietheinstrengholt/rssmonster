import { afterEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { markArticlesRead } from '../../services/articles/bulkRead.js';

const { Article, Category, Event, Feed, User } = db;

const fixture = async (count = 1) => {
  const user = await User.create({ username: `bulk-read-${crypto.randomUUID()}`, password: 'test-password' });
  const category = await Category.create({ userId: user.id, name: 'Bulk read' });
  const feed = await Feed.create({
    userId: user.id, categoryId: category.id, feedName: 'Bulk read', url: `https://example.com/${user.id}.xml`
  });
  const articles = await Article.bulkCreate(Array.from({ length: count }, (_, index) => ({
    userId: user.id, feedId: feed.id, title: `Article ${index}`, status: 'unread',
    url: `https://example.com/${user.id}/${index}`, publishedAt: new Date('2026-01-01T12:00:00Z')
  })));
  return { user, feed, articles };
};

const matching = (query = {}, allowCursor = true) => ({ type: 'matching', query, allowCursor });

afterEach(() => vi.restoreAllMocks());

describe('bulk article reading', () => {
  it.each(['articles', 'snapshot', 'matching'])('keeps foreign, filtered and duplicate Articles unread for %s', async type => {
    const { user, articles } = await fixture(3);
    const foreign = await fixture();
    await articles[1].update({ filteredInd: true });
    await articles[2].update({ duplicateOfArticleId: articles[0].id });
    const selection = type === 'matching'
      ? matching()
      : { type, articleIds: [...articles.map(article => article.id), foreign.articles[0].id] };

    const result = await markArticlesRead({ userId: user.id, selection });

    await Promise.all([...articles, ...foreign.articles].map(article => article.reload()));
    expect(articles.map(article => article.status)).toEqual(['read', 'unread', 'unread']);
    expect(foreign.articles[0].status).toBe('unread');
    if (type === 'articles') {
      expect(result.articles.map(article => article.id)).toEqual([articles[0].id]);
      expect(result.articles[0].feed.id).toBe(articles[0].feedId);
    } else {
      expect(result.updatedCount).toBe(1);
    }
  });

  it('treats an empty snapshot as a no-op and deduplicates supplied IDs', async () => {
    const { user, articles } = await fixture(2);
    expect(await markArticlesRead({ userId: user.id, selection: { type: 'snapshot', articleIds: [] } }))
      .toEqual({ updatedCount: 0, matchedCount: 0, expandedEventCount: 0 });
    expect((await articles[0].reload()).status).toBe('unread');

    const result = await markArticlesRead({
      userId: user.id,
      selection: { type: 'snapshot', articleIds: [articles[0].id, String(articles[0].id)] }
    });

    expect(result).toEqual({ updatedCount: 1, matchedCount: 1, expandedEventCount: 0 });
    expect((await articles[1].reload()).status).toBe('unread');
  });

  it.each(['articles', 'snapshot'])('expands an already-read %s member without changing Event pointers or hidden siblings', async type => {
    const { user, articles } = await fixture(4);
    const event = await Event.create({
      userId: user.id, representativeArticleId: articles[0].id, developingArticleId: articles[1].id,
      name: 'Bulk read Event', articleCount: 4
    });
    await Article.update({ eventId: event.id }, { where: { userId: user.id } });
    const previousReadAt = new Date('2026-01-01T13:00:00Z');
    await articles[0].update({ status: 'read', readAt: previousReadAt });
    await articles[2].update({ filteredInd: true });
    await articles[3].update({ duplicateOfArticleId: articles[0].id });

    const result = await markArticlesRead({
      userId: user.id, selection: { type, articleIds: [articles[0].id] }, grouping: 'event'
    });

    await Promise.all(articles.map(article => article.reload()));
    expect(articles.map(article => article.status)).toEqual(['read', 'read', 'unread', 'unread']);
    expect(articles[0].readAt).toEqual(previousReadAt);
    expect(articles[1].readAt).toBeInstanceOf(Date);
    await event.reload();
    expect(event.representativeArticleId).toBe(articles[0].id);
    expect(event.developingArticleId).toBe(articles[1].id);
    if (type === 'snapshot') expect(result.expandedEventCount).toBe(1);
    else expect(result.articles.map(article => article.id)).toEqual([articles[1].id]);
  });

  it('preserves instance serialization for explicit IDs', async () => {
    const { user, articles } = await fixture();
    await articles[0].update({ contentOriginal: 'Private raw source' });

    const result = await markArticlesRead({
      userId: user.id, selection: { type: 'articles', articleIds: [articles[0].id] }
    });

    expect(result.articles[0]).toBeInstanceOf(Article);
    expect(result.articles[0].toJSON()).toMatchObject({ id: articles[0].id, status: 'read' });
    expect(result.articles[0].toJSON()).not.toHaveProperty('contentOriginal');
  });

  it('marks matching results across cursor pages with one read timestamp', async () => {
    const { user } = await fixture(101);

    expect(await markArticlesRead({ userId: user.id, selection: matching() }))
      .toEqual({ updatedCount: 101, matchedCount: 101, expandedEventCount: 0 });

    const saved = await Article.findAll({ where: { userId: user.id } });
    expect(saved.every(article => article.status === 'read')).toBe(true);
    expect(new Set(saved.map(article => article.readAt.toISOString())).size).toBe(1);
  });

  it.each([
    ['cursor', matching({ search: 'title:"Article 1"', publishedBefore: '2026-01-02T00:00:00Z' })],
    ['legacy', matching({ search: 'title:"Article 1"' }, false)],
    ['ranked', matching({ search: 'title:"Article 1" sort:quality' })],
    ['cursor fallback', matching({ search: 'title:"Article 1"' })]
  ])('retains matching constraints for %s selection', async (_name, selection) => {
    const { user, articles } = await fixture(2);
    if (_name === 'cursor fallback') await db.Setting.create({ userId: user.id, prioritizeHighTrust: true });
    const settingsBefore = await db.Setting.findOne({ where: { userId: user.id }, raw: true });

    expect(await markArticlesRead({ userId: user.id, selection }))
      .toEqual({ updatedCount: 1, matchedCount: 1, expandedEventCount: 0 });

    expect((await articles[0].reload()).status).toBe('unread');
    expect((await articles[1].reload()).status).toBe('read');
    expect(await db.Setting.findOne({ where: { userId: user.id }, raw: true })).toEqual(settingsBefore);
  });

  it('retries a transient write deadlock', async () => {
    const { user, articles } = await fixture();
    vi.spyOn(Article, 'update').mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }));

    const result = await markArticlesRead({
      userId: user.id, selection: { type: 'snapshot', articleIds: [articles[0].id] }
    });

    expect(result.updatedCount).toBe(1);
    expect((await articles[0].reload()).status).toBe('read');
  });

  it('retains the completed cursor page when a later write fails', async () => {
    const { user } = await fixture(101);
    const originalUpdate = Article.update;
    let writes = 0;
    const failure = new Error('Database unavailable');
    vi.spyOn(Article, 'update').mockImplementation(function (...args) {
      if (++writes === 2) throw failure;
      return originalUpdate.apply(this, args);
    });

    await expect(markArticlesRead({ userId: user.id, selection: matching() })).rejects.toBe(failure);

    expect(await Article.count({ where: { userId: user.id, status: 'read' } })).toBe(100);
    expect(await Article.count({ where: { userId: user.id, status: 'unread' } })).toBe(1);
  });
});
