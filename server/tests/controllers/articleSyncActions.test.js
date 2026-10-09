import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { synchronizeArticleActions } from '../../services/articles/syncActions.js';

let app;
beforeAll(async () => { process.env.DISABLE_LISTENER = 'true'; app = (await import('../../app.js')).default; }, 50000);
const fixture = async () => {
  const user = await db.User.create({ username: `sync-${randomUUID()}`, password: 'unused' });
  const category = await db.Category.create({ userId: user.id, name: 'Sync' });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Sync', url: `https://${randomUUID()}.example/feed` });
  const article = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Offline article', publishedAt: new Date() });
  const token = jwt.sign({ userId: user.id }, getJwtSecret());
  const post = actions => request(app).post('/api/articles/sync-actions').set('Authorization', `Bearer ${token}`).send({ actions });
  return { user, article, feed, post };
};
const action = (article, kind = 'set-status', value = 'read') => ({ actionId: randomUUID(), articleId: article.id, kind, value });

describe('receipt-backed article synchronization', () => {
  it('applies read, unread, favorite and unfavorite independently without observation evidence or Event expansion', async () => {
    const { user, article, feed, post } = await fixture();
    const event = await db.Event.create({ userId: user.id, name: 'Event', representativeArticleId: article.id });
    await article.update({ eventId: event.id, firstSeen: new Date('2025-01-01'), attentionBucket: 3, lastMeaningfulReadAt: new Date('2025-01-01') });
    const sibling = await db.Article.create({ userId: user.id, feedId: feed.id, title: 'Sibling', eventId: event.id });
    const first = await post([action(article), action(article, 'set-favorite', true)]);
    expect(first.status).toBe(200);
    expect(first.body.results.map(result => result.outcome)).toEqual(['applied', 'applied']);
    expect(first.body.articles[0]).toMatchObject({ status: 'read', favoriteInd: 1, feed: { categoryId: feed.categoryId } });
    await sibling.reload(); expect(sibling.status).toBe('unread');
    expect((await post([action(article, 'set-status', 'unread'), action(article, 'set-favorite', false)])).status).toBe(200);
    await article.reload();
    expect(article.status).toBe('unread'); expect(article.readAt).toBeNull();
    expect(article.favoriteInd).toBe(0); expect(article.favoritedAt).toBeNull();
    expect(article.firstSeen.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(article.attentionBucket).toBe(3); expect(article.lastMeaningfulReadAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(article.clickedAmount).toBe(0);
  });
  it('retries an ambiguous committed request without refreshing clocks or requesting personalization twice', async () => {
    const { user, article, post } = await fixture();
    const actions = [action(article), action(article, 'set-favorite', true)];
    expect((await post(actions)).status).toBe(200);
    await article.reload();
    const readAt = article.readAt; const favoritedAt = article.favoritedAt;
    const job = await db.ProcessingJob.findOne({ where: { userId: user.id, type: 'personalization_refresh' } });
    const requestId = job.payload.requestId;
    const replay = await post(actions);
    expect(replay.body.results.map(result => result.outcome)).toEqual(['duplicate', 'duplicate']);
    await article.reload(); await job.reload();
    expect(article.readAt).toEqual(readAt); expect(article.favoritedAt).toEqual(favoritedAt);
    expect(job.payload.requestId).toBe(requestId);
    expect(await db.ArticleSyncAction.count({ where: { userId: user.id } })).toBe(2);
    expect((await post([action(article), action(article, 'set-favorite', true)])).body.results.map(result => result.outcome)).toEqual(['noop', 'noop']);
    await job.reload(); expect(job.payload.requestId).toBe(requestId);
  });
  it('rejects UUID reuse with another payload and returns current rather than historical state', async () => {
    const { article, post } = await fixture();
    const read = action(article);
    await post([read]);
    await post([action(article, 'set-status', 'unread')]);
    const replay = await post([read, { ...read, value: 'unread' }]);
    expect(replay.body.results).toEqual([{ actionId: read.actionId, outcome: 'duplicate' }, { actionId: read.actionId, outcome: 'rejected', errorCode: 'ACTION_ID_REUSED' }]);
    expect(replay.body.articles[0].status).toBe('unread');
  });
  it('handles unavailable and foreign articles without leaking their state or failing accessible actions', async () => {
    const own = await fixture(); const foreign = await fixture();
    const deleted = action({ id: 2147483647 });
    const filtered = await db.Article.create({ userId: own.user.id, feedId: own.feed.id, title: 'Filtered', filteredInd: true });
    const response = await own.post([action(foreign.article), deleted, action(filtered), action(own.article)]);
    expect(response.status).toBe(200);
    expect(response.body.results.map(result => result.outcome)).toEqual(['rejected', 'rejected', 'rejected', 'applied']);
    expect(response.body.results[0].errorCode).toBe('ARTICLE_UNAVAILABLE');
    expect(response.body.articles.map(article => article.id)).toEqual([own.article.id]);
    await foreign.article.reload(); expect(foreign.article.status).toBe('unread');
    expect((await own.post([deleted])).body.results[0].outcome).toBe('rejected');
  });
  it('validates the entire envelope before writing any action', async () => {
    const { user, article, post } = await fixture();
    for (const invalid of [[], Array.from({ length: 51 }, () => action(article)), [action(article), { ...action(article), value: true }], [{ ...action(article), articleId: '41' }], [{ ...action(article), actionId: 'invalid' }]]) {
      expect((await post(invalid)).status).toBe(400);
    }
    expect(await db.ArticleSyncAction.count({ where: { userId: user.id } })).toBe(0);
    await article.reload(); expect(article.status).toBe('unread');
  });
  it('serializes concurrent duplicate deliveries into one receipt and one effect', async () => {
    const { user, article, post } = await fixture();
    const saved = action(article, 'set-favorite', true);
    const responses = await Promise.all([post([saved]), post([saved])]);
    expect(responses.map(response => response.body.results[0].outcome).sort()).toEqual(['applied', 'duplicate']);
    expect(await db.ArticleSyncAction.count({ where: { userId: user.id } })).toBe(1);
  });
  it('rolls back state and personalization if receipt persistence fails, and stops later assignments', async () => {
    const { user, article } = await fixture();
    const create = vi.spyOn(db.ArticleSyncAction, 'create').mockRejectedValueOnce(new Error('Receipt unavailable'));
    const response = await synchronizeArticleActions(user.id, [action(article, 'set-favorite', true), action(article)]);
    create.mockRestore();
    expect(response.results.map(result => result.outcome)).toEqual(['retry', 'retry']);
    await article.reload(); expect(article.favoriteInd).toBe(0); expect(article.status).toBe('unread');
    expect(await db.ProcessingJob.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.ArticleSyncAction.count({ where: { userId: user.id } })).toBe(0);
  });
});
