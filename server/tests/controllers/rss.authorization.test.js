import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { Article, Category, Feed, User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = username => User.create({
  username,
  password: 'hashed-password',
  hash: `${username}-hash`,
  role: 'user'
});

const authHeaderFor = user => {
  const token = jwt.sign(
    {
      username: user.username,
      userId: user.id
    },
    getJwtSecret()
  );

  return `Bearer ${token}`;
};

const createFeedFor = async user => {
  const category = await Category.create({
    userId: user.id,
    name: `${user.username} category`,
    categoryOrder: 1
  });

  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${user.username} feed`,
    feedDesc: 'Owned feed',
    url: `https://example.com/${user.username}.xml`,
    status: 'active'
  });

  return { category, feed };
};

describe('RSS authorization', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('requires JWT authentication', async () => {
    const res = await request(app).get('/rss');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Your session is not valid!' });
  });

  it('uses the authenticated user instead of a query string userId', async () => {
    const owner = await createUser(uniqueName('rss-owner'));
    const otherUser = await createUser(uniqueName('rss-other'));
    const { feed: ownerFeed } = await createFeedFor(owner);
    const { feed: otherFeed } = await createFeedFor(otherUser);

    await Article.create({
      userId: owner.id,
      feedId: ownerFeed.id,
      title: 'Authenticated user article',
      url: 'https://example.com/authenticated-user-article',
      contentHtml: 'Visible to the authenticated user',
      published: new Date('2026-05-31T10:00:00Z')
    });

    await Article.create({
      userId: otherUser.id,
      feedId: otherFeed.id,
      title: 'Spoofed query user article',
      url: 'https://example.com/spoofed-query-user-article',
      contentHtml: 'This should not leak',
      published: new Date('2026-05-31T11:00:00Z')
    });

    const res = await request(app)
      .get(`/rss?userId=${otherUser.id}`)
      .set('Authorization', authHeaderFor(owner));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Authenticated user article');
    expect(res.text).not.toContain('Spoofed query user article');
  });
});
