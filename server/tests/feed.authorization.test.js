import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../models/index.js';
import { getJwtSecret } from '../config/auth.js';

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

describe('feed ownership authorization', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('GET feed by ID rejects foreign-user feed', async () => {
    const owner = await createUser(uniqueName('feed-owner'));
    const foreignUser = await createUser(uniqueName('feed-viewer'));
    const { feed } = await createFeedFor(owner);

    const res = await request(app)
      .get(`/api/feeds/${feed.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Feed not found' });
  });

  it('PUT feed by ID rejects foreign-user feed', async () => {
    const owner = await createUser(uniqueName('feed-owner'));
    const foreignUser = await createUser(uniqueName('feed-editor'));
    const { feed } = await createFeedFor(owner);

    const res = await request(app)
      .put(`/api/feeds/${feed.id}`)
      .set('Authorization', authHeaderFor(foreignUser))
      .send({
        feedName: 'Updated by foreign user',
        feedDesc: 'Should not persist',
        categoryId: feed.categoryId,
        url: 'https://example.com/foreign-update.xml',
        favicon: '',
        status: 'disabled'
      });

    await feed.reload();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Feed not found' });
    expect(feed.feedName).toBe(`${owner.username} feed`);
    expect(feed.url).toBe(`https://example.com/${owner.username}.xml`);
    expect(feed.status).toBe('active');
  });

  it('PUT feed by ID rejects assigning an owned feed to a foreign-user category', async () => {
    const owner = await createUser(uniqueName('feed-owner'));
    const foreignUser = await createUser(uniqueName('feed-category-owner'));
    const { feed } = await createFeedFor(owner);
    const { category: foreignCategory } = await createFeedFor(foreignUser);

    const res = await request(app)
      .put(`/api/feeds/${feed.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        feedName: 'Updated with foreign category',
        feedDesc: 'Should not persist',
        categoryId: foreignCategory.id,
        url: 'https://example.com/foreign-category-update.xml',
        favicon: '',
        status: 'disabled'
      });

    await feed.reload();

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Category not found' });
    expect(feed.categoryId).not.toBe(foreignCategory.id);
    expect(feed.feedName).toBe(`${owner.username} feed`);
    expect(feed.status).toBe('active');
  });

  it('POST feed rejects foreign-user category', async () => {
    const owner = await createUser(uniqueName('feed-owner'));
    const foreignUser = await createUser(uniqueName('feed-category-owner'));
    const { category: foreignCategory } = await createFeedFor(foreignUser);

    const res = await request(app)
      .post('/api/feeds')
      .set('Authorization', authHeaderFor(owner))
      .send({
        feedName: 'New feed with foreign category',
        feedDesc: 'Should not persist',
        feedType: 'rss',
        categoryId: foreignCategory.id,
        url: 'https://example.com/new-foreign-category.xml',
        favicon: '',
        status: 'active'
      });

    const persistedFeed = await Feed.findOne({
      where: {
        userId: owner.id,
        url: 'https://example.com/new-foreign-category.xml'
      }
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Category not found' });
    expect(persistedFeed).toBeNull();
  });

  it('DELETE feed by ID rejects foreign-user feed', async () => {
    const owner = await createUser(uniqueName('feed-owner'));
    const foreignUser = await createUser(uniqueName('feed-deleter'));
    const { feed } = await createFeedFor(owner);
    const article = await Article.create({
      userId: owner.id,
      feedId: feed.id,
      status: 'unread',
      url: `https://example.com/${owner.username}/article`,
      title: `${owner.username} article`,
      published: new Date('2026-05-01T10:00:00Z')
    });

    const res = await request(app)
      .delete(`/api/feeds/${feed.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    const persistedFeed = await Feed.findByPk(feed.id);
    const persistedArticle = await Article.findByPk(article.id);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Feed not found' });
    expect(persistedFeed).not.toBeNull();
    expect(persistedArticle).not.toBeNull();
  });

  it('POST rediscover-rss rejects foreign-user feed before rediscovery', async () => {
    const owner = await createUser(uniqueName('feed-owner'));
    const foreignUser = await createUser(uniqueName('feed-rediscover'));
    const { feed } = await createFeedFor(owner);

    const res = await request(app)
      .post(`/api/feeds/${feed.id}/rediscover-rss`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Feed not found' });
  });
});
