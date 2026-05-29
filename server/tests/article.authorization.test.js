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
    url: `https://example.com/${user.username}/article`,
    title: `${user.username} article`,
    contentOriginal: '<p>Article body</p>',
    contentStripped: 'Article body',
    published: new Date('2026-05-01T10:00:00Z')
  });

  return { category, feed, article };
};

describe('article ownership authorization', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('GET article by ID rejects foreign-user article', async () => {
    const owner = await createUser(uniqueName('article-owner'));
    const foreignUser = await createUser(uniqueName('article-viewer'));
    const { article } = await createArticleFor(owner);

    const res = await request(app)
      .get(`/api/articles/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Article not found' });
  });

  it('mark-as-seen rejects foreign-user article without mutating it', async () => {
    const owner = await createUser(uniqueName('article-owner'));
    const foreignUser = await createUser(uniqueName('article-marker'));
    const { article } = await createArticleFor(owner);

    const res = await request(app)
      .post(`/api/articles/markasseen/${article.id}`)
      .set('Authorization', authHeaderFor(foreignUser))
      .send({
        selectedStatus: 'unread',
        visibleSeconds: 120
      });

    await article.reload();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Error: article not found' });
    expect(article.status).toBe('unread');
    expect(article.firstSeen).toBeNull();
    expect(article.attentionBucket).toBe(0);
  });
});
