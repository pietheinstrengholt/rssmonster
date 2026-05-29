import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '../models/index.js';

const { Article, Category, Feed, Hotlink, User, sequelize } = db;

let app;

const createFixture = async () => {
  const user = await User.create({
    username: `fever-${Date.now()}`,
    password: 'password',
    hash: `fever-api-key-${Date.now()}`,
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: 'Fever',
    categoryOrder: 0
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'Fever Feed',
    url: 'https://example.com/feed.xml'
  });
  const linkedArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: 'https://example.com/hot',
    title: 'Hot Article',
    description: 'Linked by another article',
    published: new Date('2026-05-01T10:00:00Z'),
    hotlinks: 2
  });
  const unlinkedArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: 'https://example.com/cold',
    title: 'Cold Article',
    description: 'Not linked',
    published: new Date('2026-05-01T11:00:00Z')
  });

  await Hotlink.create({
    userId: user.id,
    feedId: feed.id,
    url: linkedArticle.url
  });

  return { user, linkedArticle, unlinkedArticle };
};

describe('Fever API compatibility', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns articles whose URLs are present in the user hotlink table', async () => {
    const { user, linkedArticle, unlinkedArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: user.hash, links: '' });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(1);
    expect(res.body.links.map(link => link.id)).toContain(linkedArticle.id);
    expect(res.body.links.map(link => link.id)).not.toContain(unlinkedArticle.id);
  });
});
