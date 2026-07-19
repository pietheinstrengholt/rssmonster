import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '../../models/index.js';

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
    contentOriginal: '<script>window.rawFeverScript = true</script><p>Raw Fever body</p>',
    contentHtml: '<p>Sanitized Fever body</p>',
    publishedAt: new Date('2026-05-01T10:00:00Z'),
    hotlinks: 2
  });
  const unlinkedArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: 'https://example.com/cold',
    title: 'Cold Article',
    description: 'Not linked',
    publishedAt: new Date('2026-05-01T11:00:00Z')
  });

  await Hotlink.create({
    userId: user.id,
    feedId: feed.id,
    url: linkedArticle.url
  });

  return { user, linkedArticle, unlinkedArticle };
};

const createFaviconFixture = async () => {
  const user = await User.create({
    username: `fever-favicon-${Date.now()}`,
    password: 'password',
    hash: `fever-favicon-api-key-${Date.now()}`,
    role: 'user'
  });
  const otherUser = await User.create({
    username: `fever-other-${Date.now()}`,
    password: 'password',
    hash: `fever-other-api-key-${Date.now()}`,
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: 'Fever Favicons',
    categoryOrder: 0
  });
  const otherCategory = await Category.create({
    userId: otherUser.id,
    name: 'Other Favicons',
    categoryOrder: 0
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'Owned Feed',
    url: 'https://example.com/owned.xml',
    favicon: 'data:image/png;base64,owned'
  });
  const otherFeed = await Feed.create({
    userId: otherUser.id,
    categoryId: otherCategory.id,
    feedName: 'Other Feed',
    url: 'https://example.com/other.xml',
    favicon: 'data:image/png;base64,other'
  });

  return { user, feed, otherFeed };
};

describe('Fever API compatibility', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
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

  it('returns only sanitized article HTML in item payloads', async () => {
    const { user, linkedArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: user.hash, items: '', with_ids: String(linkedArticle.id) });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: linkedArticle.id,
        html: '<p>Sanitized Fever body</p>'
      })
    ]));
    expect(JSON.stringify(res.body)).not.toContain('rawFeverScript');
  });

  it('returns favicons only for feeds owned by the authenticated user', async () => {
    const { user, feed, otherFeed } = await createFaviconFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: user.hash, favicons: '' });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(1);
    expect(res.body.favicons.map(favicon => favicon.id)).toContain(feed.id);
    expect(res.body.favicons.map(favicon => favicon.id)).not.toContain(otherFeed.id);
  });
});
