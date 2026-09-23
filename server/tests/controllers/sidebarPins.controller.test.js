import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const users = [];
let app;
const fixture = async () => {
  const user = await db.User.create({ username: `pins-${Date.now()}-${users.length}`, password: 'test-password' });
  users.push(user);
  const category = await db.Category.create({ userId: user.id, name: 'Pinned category', categoryOrder: 7 });
  const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Pinned feed', url: 'https://pins.test/rss' });
  const authorization = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
  return { user, category, feed, authorization };
};

describe('Sidebar pinned items', () => {
  beforeAll(async () => { app = (await import('../../app.js')).default; }, 50_000);
  afterAll(async () => { for (const user of users) await user.destroy(); });

  it('creates unpinned feeds and categories and exposes their defaults in the sidebar', async () => {
    const { category, feed, authorization } = await fixture();
    expect((await feed.reload()).pinned).toBe(false);
    expect((await category.reload()).pinned).toBe(false);
    const response = await request(app).get('/api/manager/overview-lite').set('Authorization', authorization);
    expect(response.status).toBe(200);
    expect(response.body.categories[0]).toMatchObject({ id: category.id, pinned: false, feeds: [{ id: feed.id, pinned: false }] });
  });

  it.each(['feed', 'category'])('pins and unpins an owned %s without changing its other fields', async kind => {
    const items = await fixture();
    const item = items[kind];
    for (const pinned of [true, false]) {
      const response = await request(app).put(`/api/${kind === 'feed' ? 'feeds' : 'categories'}/${item.id}`)
        .set('Authorization', items.authorization).send({ pinned });
      expect(response.status).toBe(200);
      expect(kind === 'feed' ? response.body.feed.pinned : response.body.pinned).toBe(pinned);
      expect((await item.reload()).pinned).toBe(pinned);
      expect(await items.feed.reload()).toMatchObject({
        url: 'https://pins.test/rss', feedName: 'Pinned feed', categoryId: items.category.id, status: 'active', updateIntervalMinutes: null
      });
      expect(await items.category.reload()).toMatchObject({ name: 'Pinned category', categoryOrder: 7 });
      for (const [method, path] of [['get', '/api/manager/overview-lite'], ['post', '/api/manager/overview']]) {
        const overview = await request(app)[method](path).set('Authorization', items.authorization).send({});
        expect(overview.status).toBe(200);
        const category = overview.body.categories[0];
        expect(category.pinned).toBe(kind === 'category' && pinned);
        expect(category.feeds[0].pinned).toBe(kind === 'feed' && pinned);
      }
    }
    await item.update({ pinned: true });
    const update = kind === 'feed' ? { feedName: 'Renamed', url: items.feed.url } : { name: 'Renamed' };
    const response = await request(app).put(`/api/${kind === 'feed' ? 'feeds' : 'categories'}/${item.id}`).set('Authorization', items.authorization).send(update);
    expect(response.status).toBe(200);
    expect((await item.reload()).pinned).toBe(true);
    expect(kind === 'feed' ? item.feedName : item.name).toBe('Renamed');
  });

  it.each(['feed', 'category'])('cannot pin another user\'s %s', async kind => {
    const owner = await fixture();
    const other = await fixture();
    for (const pinned of [true, false]) {
      await owner[kind].update({ pinned: !pinned });
      const response = await request(app).put(`/api/${kind === 'feed' ? 'feeds' : 'categories'}/${owner[kind].id}`)
        .set('Authorization', other.authorization).send({ pinned, userId: owner.user.id });
      expect(response.status).toBe(404);
      expect((await owner[kind].reload()).pinned).toBe(!pinned);
    }
    const overview = await request(app).get('/api/manager/overview-lite').set('Authorization', other.authorization);
    expect(overview.status).toBe(200);
    expect(overview.body.categories.map(category => category.id)).toEqual([other.category.id]);
    expect(overview.body.categories[0].feeds.map(feed => feed.id)).toEqual([other.feed.id]);
  });

  it.each(['feed', 'category'])('rejects non-boolean pinned values for a %s', async kind => {
    const items = await fixture();
    for (const pinned of [null, 1, 'false']) {
      const response = await request(app).put(`/api/${kind === 'feed' ? 'feeds' : 'categories'}/${items[kind].id}`)
        .set('Authorization', items.authorization).send({ pinned });
      expect(response.status).toBe(400);
      expect((await items[kind].reload()).pinned).toBe(false);
    }
  });
});
