import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import db from '../models/index.js';

const { Article, Category, Feed, User, sequelize } = db;

let app;

const createUser = username => User.create({
  username,
  password: 'hashed-password',
  hash: crypto.createHash('md5').update(`${username}:password`).digest('hex')
});

const greaderAuthHeaderFor = user => {
  const salt = process.env.GREADER_SALT || 'rssmonster-greader-salt';
  const token = crypto
    .createHash('sha1')
    .update(salt + user.username + user.hash)
    .digest('hex');

  return `GoogleLogin auth=${user.username}/${token}`;
};

const createFixture = async () => {
  const user = await createUser(`greader-${Date.now()}`);
  const category = await Category.create({
    userId: user.id,
    name: 'Tech / News',
    categoryOrder: 1
  });
  const fallbackCategory = await Category.create({
    userId: user.id,
    name: 'Archive',
    categoryOrder: 2
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'Example Feed',
    feedDesc: 'Example feed description',
    url: 'https://example.com/rss.xml'
  });
  const article = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    starInd: 1,
    url: 'https://example.com/article',
    title: 'Example Article',
    author: 'Reporter',
    description: 'Fallback description',
    contentOriginal: '<p>Current article body</p>',
    contentStripped: 'Current article body',
    published: new Date('2026-05-01T10:00:00Z'),
    firstSeen: new Date('2026-05-01T10:05:00Z')
  });

  return { user, category, fallbackCategory, feed, article };
};

describe('Google Reader API compatibility', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('serializes stream contents with current article fields and encoded category labels', async () => {
    const { user, feed } = await createFixture();

    const res = await request(app)
      .get(`/api/greader/reader/api/0/stream/contents/feed/${encodeURIComponent(feed.url)}`)
      .query({ output: 'json' })
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].summary.content).toBe('<p>Current article body</p>');
    expect(res.body.items[0].origin.streamId).toBe(`feed/${feed.id}`);
    expect(res.body.items[0].categories).toContain('user/-/label/Tech%20%2F%20News');
  });

  it('preserves feeds and articles when disabling a category', async () => {
    const { user, category, fallbackCategory, feed, article } = await createFixture();

    const res = await request(app)
      .post('/api/greader/reader/api/0/disable-tag')
      .type('form')
      .send({ s: `user/-/label/${encodeURIComponent(category.name)}` })
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(res.status).toBe(200);

    const deletedCategory = await Category.findByPk(category.id);
    const persistedFeed = await Feed.findByPk(feed.id);
    const persistedArticle = await Article.findByPk(article.id);

    expect(deletedCategory).toBeNull();
    expect(persistedFeed).not.toBeNull();
    expect(persistedFeed.categoryId).toBe(fallbackCategory.id);
    expect(persistedArticle).not.toBeNull();
  });
});
