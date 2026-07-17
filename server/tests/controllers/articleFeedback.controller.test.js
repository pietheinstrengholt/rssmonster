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
  hash: `${username}-hash`
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

const createArticleFor = async user => {
  const category = await Category.create({
    userId: user.id,
    name: `${user.username} category`,
    categoryOrder: 1
  });

  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${user.username} feed`,
    url: `https://example.com/${user.username}.xml`
  });

  const article = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    negativeInd: 1,
    positiveInd: 0,
    url: `https://example.com/${user.username}/article`,
    title: `${user.username} article`,
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    publishedAt: new Date('2026-05-01T10:00:00Z')
  });

  return { category, feed, article };
};

describe('article recommendation feedback', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('marks an owned article as more like this', async () => {
    const user = await createUser(uniqueName('feedback-owner'));
    const { article } = await createArticleFor(user);

    const res = await request(app)
      .post(`/api/articles/markmorelikethis/${article.id}`)
      .set('Authorization', authHeaderFor(user));

    await article.reload();

    expect(res.status).toBe(200);
    expect(article.positiveInd).toBe(1);
    expect(article.negativeInd).toBe(0);
  });

  it('rejects more-like-this feedback for a foreign-user article', async () => {
    const owner = await createUser(uniqueName('feedback-owner'));
    const foreignUser = await createUser(uniqueName('feedback-viewer'));
    const { article } = await createArticleFor(owner);

    const res = await request(app)
      .post(`/api/articles/markmorelikethis/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    await article.reload();

    expect(res.status).toBe(404);
    expect(article.positiveInd).toBe(0);
    expect(article.negativeInd).toBe(1);
  });
});
