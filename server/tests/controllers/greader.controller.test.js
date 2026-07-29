import { beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash,
  createGreaderActionToken,
  createGreaderAuthToken
} from '../../utils/apiCredentials.js';

const { Article, Category, Feed, User, sequelize } = db;

let app;

const createUser = async username => User.create({
  username,
  password: await bcrypt.hash('password', 10),
  feverCredentialHash: createFeverCredentialHash(
    createFeverApiKey(username, 'password')
  )
});

const greaderAuthHeaderFor = user =>
  `GoogleLogin auth=${user.username}/${createGreaderAuthToken(user)}`;

// This function creates the action token required by mutation tests.
const greaderActionTokenFor = user =>
  createGreaderActionToken(user, createGreaderAuthToken(user));

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
    favoriteInd: 1,
    url: 'https://example.com/article',
    title: 'Example Article',
    author: 'Reporter',
    description: 'Fallback description',
    contentOriginal: '<script>window.rawPublisherScript = true</script><p>Raw article body</p>',
    contentHtml: '<p>Sanitized article body</p>',
    publishedAt: new Date('2026-05-01T10:00:00Z'),
    firstSeen: new Date('2026-05-01T10:05:00Z')
  });

  return { user, category, fallbackCategory, feed, article };
};

describe('Google Reader API compatibility', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('authenticates ClientLogin with the bcrypt account password', async () => {
    const user = await createUser(`greader-login-${Date.now()}`);

    const res = await request(app)
      .post('/api/greader/accounts/ClientLogin')
      .type('form')
      .send({ Email: user.username, Passwd: 'password' });

    expect(res.status).toBe(200);
    expect(res.text).toContain(`Auth=${user.username}/`);
  });

  it('rejects an incorrect ClientLogin password', async () => {
    const user = await createUser(`greader-rejected-${Date.now()}`);

    const res = await request(app)
      .post('/api/greader/accounts/ClientLogin')
      .type('form')
      .send({ Email: user.username, Passwd: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('serializes stream contents with current article fields and encoded category labels', async () => {
    const { user, feed } = await createFixture();

    const res = await request(app)
      .get(`/api/greader/reader/api/0/stream/contents/feed/${encodeURIComponent(feed.url)}`)
      .query({ output: 'json' })
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].summary.content).toBe('<p>Sanitized article body</p>');
    expect(JSON.stringify(res.body)).not.toContain('rawPublisherScript');
    expect(res.body.items[0].origin.streamId).toBe(`feed/${encodeURIComponent(feed.url)}`);
    expect(res.body.items[0].categories).toContain('user/-/label/Tech%20%2F%20News');
  });

  it('uses the same feed stream IDs for subscriptions and unread counts', async () => {
    const { user, feed } = await createFixture();

    const subscriptionRes = await request(app)
      .get('/api/greader/reader/api/0/subscription/list')
      .query({ output: 'json' })
      .set('Authorization', greaderAuthHeaderFor(user));
    const unreadRes = await request(app)
      .get('/api/greader/reader/api/0/unread-count')
      .query({ output: 'json' })
      .set('Authorization', greaderAuthHeaderFor(user));

    const streamId = `feed/${encodeURIComponent(feed.url)}`;

    expect(subscriptionRes.status).toBe(200);
    expect(unreadRes.status).toBe(200);
    expect(subscriptionRes.body.subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: streamId })
    ]));
    expect(unreadRes.body.unreadcounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: streamId, count: 1 })
    ]));
  });

  it('reports reading-list unread count from all unread articles for the user', async () => {
    const { user, feed, article } = await createFixture();
    await Article.create({
      userId: user.id,
      feedId: feed.id,
      status: 'unread',
      favoriteInd: 0,
      url: 'https://example.com/second',
      title: 'Second Article',
      publishedAt: new Date('2026-05-02T10:00:00Z'),
      firstSeen: new Date('2026-05-02T10:05:00Z')
    });

    const otherUser = await createUser(`greader-other-${Date.now()}`);
    const otherCategory = await Category.create({ userId: otherUser.id, name: 'Other' });
    const otherFeed = await Feed.create({
      userId: otherUser.id,
      categoryId: otherCategory.id,
      feedName: 'Other Feed',
      url: 'https://other.example.com/rss.xml'
    });
    await Article.create({
      userId: otherUser.id,
      feedId: otherFeed.id,
      status: 'unread',
      url: 'https://other.example.com/article',
      title: 'Other Article',
      publishedAt: new Date('2026-05-03T10:00:00Z')
    });

    const res = await request(app)
      .get('/api/greader/reader/api/0/unread-count')
      .query({ output: 'json' })
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.max).toBe(2);
    expect(res.body.unreadcounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'user/-/state/com.google/reading-list', count: 2 }),
      expect.objectContaining({ id: `feed/${encodeURIComponent(feed.url)}`, count: 2 }),
      expect.objectContaining({ id: 'user/-/label/Tech%20%2F%20News', count: 2 })
    ]));

    await article.reload();
    expect(article.status).toBe('unread');
  });

  it('uses one grouped article query and includes zero-count feeds and categories', async () => {
    const { user, fallbackCategory } = await createFixture();
    const emptyFeed = await Feed.create({
      userId: user.id,
      categoryId: fallbackCategory.id,
      feedName: 'Empty Feed',
      url: `https://empty-${Date.now()}.example.com/rss.xml`
    });
    const articleFindAll = vi.spyOn(Article, 'findAll');
    const articleCount = vi.spyOn(Article, 'count');
    const articleFindOne = vi.spyOn(Article, 'findOne');

    try {
      const res = await request(app)
        .get('/api/greader/reader/api/0/unread-count')
        .query({ output: 'json' })
        .set('Authorization', greaderAuthHeaderFor(user));

      expect(res.status).toBe(200);
      expect(articleFindAll).toHaveBeenCalledTimes(1);
      expect(articleCount).not.toHaveBeenCalled();
      expect(articleFindOne).not.toHaveBeenCalled();
      expect(res.body.unreadcounts).toEqual(expect.arrayContaining([
        {
          id: `feed/${encodeURIComponent(emptyFeed.url)}`,
          count: 0,
          newestItemTimestampUsec: '0'
        },
        {
          id: `user/-/label/${encodeURIComponent(fallbackCategory.name)}`,
          count: 0,
          newestItemTimestampUsec: '0'
        }
      ]));
    } finally {
      articleFindAll.mockRestore();
      articleCount.mockRestore();
      articleFindOne.mockRestore();
    }
  });

  it('keeps readAt synchronized with Google Reader read tags', async () => {
    const { user, article } = await createFixture();
    const itemId = `tag:google.com,2005:reader/item/${article.id.toString(16).padStart(16, '0')}`;

    const readResponse = await request(app)
      .post('/api/greader/reader/api/0/edit-tag')
      .type('form')
      .send({
        i: itemId,
        a: 'user/-/state/com.google/read',
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));

    await article.reload();

    expect(readResponse.status).toBe(200);
    expect(article.status).toBe('read');
    expect(article.readAt).toBeInstanceOf(Date);

    const unreadResponse = await request(app)
      .post('/api/greader/reader/api/0/edit-tag')
      .type('form')
      .send({
        i: itemId,
        r: 'user/-/state/com.google/read',
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));

    await article.reload();

    expect(unreadResponse.status).toBe(200);
    expect(article.status).toBe('unread');
    expect(article.readAt).toBeNull();
  });

  it('preserves feeds and articles when disabling a category', async () => {
    const { user, category, fallbackCategory, feed, article } = await createFixture();

    const res = await request(app)
      .post('/api/greader/reader/api/0/disable-tag')
      .type('form')
      .send({
        s: `user/-/label/${encodeURIComponent(category.name)}`,
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(res.status).toBe(200);

    const deletedCategory = await Category.findByPk(category.id);
    const persistedFeed = await Feed.findByPk(feed.id);
    const persistedArticle = await Article.findByPk(article.id);

    expect(deletedCategory).toBeNull();
    expect(persistedFeed).not.toBeNull();
    const defaultCategory = await Category.findOne({
      where: { userId: user.id, name: 'Uncategorized' }
    });
    expect(defaultCategory).not.toBeNull();
    expect(persistedFeed.categoryId).toBe(defaultCategory.id);
    expect(persistedFeed.categoryId).not.toBe(fallbackCategory.id);
    expect(persistedArticle).not.toBeNull();
  });
});
