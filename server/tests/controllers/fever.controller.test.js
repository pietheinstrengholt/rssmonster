import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { parseStringPromise } from 'xml2js';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { Article, Category, Feed, Hotlink, User, sequelize } = db;

let app;
const TEST_FAVICON_BASE64 =
  'R0lGODlhAQABAIAAAObm5gAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const TEST_JPEG_FAVICON_BASE64 = Buffer.from('ffd8ff', 'hex').toString('base64');
const TEST_WEBP_FAVICON_BASE64 = Buffer.from(
  '524946460000000057454250',
  'hex'
).toString('base64');
const TEST_ICO_FAVICON_BASE64 = Buffer.from(
  '000001000100000000000000',
  'hex'
).toString('base64');

// This function creates a user with a standard Fever protocol credential.
const createFeverUser = async prefix => {
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'password';
  const apiKey = createFeverApiKey(username, password);
  const user = await User.create({
    username,
    password: 'password-hash-not-used-by-fever',
    feverCredentialHash: createFeverCredentialHash(apiKey),
    role: 'user'
  });

  return { apiKey, user };
};

const createFixture = async () => {
  const { apiKey, user } = await createFeverUser('fever');
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
    sourceArticleId: unlinkedArticle.id,
    url: linkedArticle.url
  });

  return { apiKey, user, feed, linkedArticle, unlinkedArticle };
};

// This function creates a deterministic batch of Fever paging articles.
const createPagingArticles = async (user, feed, count, prefix) =>
  Article.bulkCreate(Array.from({ length: count }, (_, index) => ({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: `https://paging.example/${prefix}-${index}`,
    title: `${prefix} ${index}`,
    description: `Paging article ${index}`,
    publishedAt: new Date('2026-06-01T00:00:00Z')
  })));

const createFaviconFixture = async () => {
  const { apiKey, user } = await createFeverUser('fever-favicon');
  const { user: otherUser } = await createFeverUser('fever-other');
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
    favicon: `data:image/gif;base64,${TEST_FAVICON_BASE64}`
  });
  const urlFeed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'URL Feed',
    url: 'https://example.com/url-feed.xml',
    favicon: 'https://example.com/favicon.ico'
  });
  const otherFeed = await Feed.create({
    userId: otherUser.id,
    categoryId: otherCategory.id,
    feedName: 'Other Feed',
    url: 'https://example.com/other.xml',
    favicon: `data:image/gif;base64,${TEST_FAVICON_BASE64}`
  });

  return { apiKey, user, feed, urlFeed, otherFeed };
};

describe('Fever API compatibility', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns only the base envelope when authentication is absent or invalid', async () => {
    const missingKeyResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({});
    const invalidKeyResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({ api_key: '00000000000000000000000000000000' });

    expect(missingKeyResponse.status).toBe(200);
    expect(missingKeyResponse.body).toEqual({
      api_version: 3,
      auth: 0
    });
    expect(invalidKeyResponse.status).toBe(200);
    expect(invalidKeyResponse.body).toEqual({
      api_version: 3,
      auth: 0
    });
  });

  it('returns the unauthenticated Fever envelope as XML when requested', async () => {
    const res = await request(app)
      .post('/api/fever')
      .query({ api: 'xml' })
      .type('form')
      .send({ api_key: '00000000000000000000000000000000' });
    const parsed = await parseStringPromise(res.text);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/xml/);
    expect(parsed.response.api_version).toEqual(['3']);
    expect(parsed.response.auth).toEqual(['0']);
    expect(parsed.response).not.toHaveProperty('last_refreshed_on_time');
  });

  it('serializes Fever collections with their protocol XML element names', async () => {
    const { apiKey, feed, linkedArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({
        api: 'XML',
        feeds: '',
        items: '',
        with_ids: String(linkedArticle.id)
      })
      .type('form')
      .send({ api_key: apiKey });
    const parsed = await parseStringPromise(res.text);

    expect(res.status).toBe(200);
    expect(parsed.response.auth).toEqual(['1']);
    expect(parsed.response.feeds[0].feed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: [String(feed.id)]
      })
    ]));
    expect(parsed.response.items[0].item).toEqual([
      expect.objectContaining({
        id: [String(linkedArticle.id)],
        html: ['<p>Sanitized Fever body</p>']
      })
    ]);
  });

  it('accepts the standard MD5 protocol key without storing it directly', async () => {
    const { apiKey, user } = await createFeverUser('fever-auth');

    const res = await request(app)
      .post('/api/fever')
      .type('form')
      .send({ api_key: apiKey });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(1);
    expect(user.feverCredentialHash).toBe(
      createFeverCredentialHash(apiKey)
    );
    expect(user.feverCredentialHash).not.toBe(apiKey);
  });

  it('accepts uppercase Fever MD5 protocol keys', async () => {
    const { apiKey } = await createFeverUser('fever-uppercase-auth');

    const res = await request(app)
      .post('/api/fever')
      .type('form')
      .send({ api_key: apiKey.toUpperCase() });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(1);
  });

  it('supports the legacy login and fever_auth cookie flow', async () => {
    const username =
      `fever-legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const password = 'legacy-password';
    const apiKey = createFeverApiKey(username, password);
    await User.create({
      username,
      password: await bcrypt.hash(password, 4),
      feverCredentialHash: createFeverCredentialHash(apiKey),
      role: 'user'
    });
    const agent = request.agent(app);

    const loginResponse = await agent
      .get('/api/fever')
      .query({
        action: 'login',
        username,
        password
      });
    const cookieResponse = await agent
      .post('/api/fever')
      .type('form')
      .send({});

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.auth).toBe(1);
    expect(loginResponse.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining(`fever_auth=${apiKey}`)
    ]));
    expect(loginResponse.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(loginResponse.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(cookieResponse.status).toBe(200);
    expect(cookieResponse.body.auth).toBe(1);
  });

  it('does not issue a Fever cookie for invalid legacy credentials', async () => {
    const username =
      `fever-invalid-legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const password = 'legacy-password';
    await User.create({
      username,
      password: await bcrypt.hash(password, 4),
      feverCredentialHash: createFeverCredentialHash(
        createFeverApiKey(username, password)
      ),
      role: 'user'
    });

    const res = await request(app)
      .get('/api/fever')
      .query({
        action: 'login',
        username,
        password: 'incorrect'
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      api_version: 3,
      auth: 0
    });
    expect(res.headers).not.toHaveProperty('set-cookie');
  });

  it('rejects malformed Fever API keys', async () => {
    const malformedKeys = [
      'not-hexadecimal',
      'a'.repeat(31),
      'a'.repeat(33)
    ];

    for (const apiKey of malformedKeys) {
      const res = await request(app)
        .post('/api/fever')
        .type('form')
        .send({ api_key: apiKey });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        api_version: 3,
        auth: 0
      });
    }
  });

  it('rejects incomplete legacy login and malformed Fever cookies', async () => {
    const incompleteLogin = await request(app)
      .get('/api/fever')
      .query({ action: 'login', username: 'missing-password' });
    const malformedCookie = await request(app)
      .post('/api/fever')
      .set('Cookie', 'flag; session=value; fever_auth=%E0%A4%A')
      .send({});

    expect(incompleteLogin.status).toBe(200);
    expect(incompleteLogin.body).toEqual({ api_version: 3, auth: 0 });
    expect(malformedCookie.status).toBe(200);
    expect(malformedCookie.body).toEqual({ api_version: 3, auth: 0 });
  });

  it('returns articles whose URLs are present in the user hotlink table', async () => {
    const { apiKey, linkedArticle, unlinkedArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, links: '' });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(1);
    expect(res.body.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        item_id: linkedArticle.id,
        feed_id: linkedArticle.feedId,
        is_item: 1,
        is_local: 1,
        item_ids: String(unlinkedArticle.id)
      })
    ]));
  });

  it('aggregates external hot links with their source item ids', async () => {
    const { apiKey, user, feed, linkedArticle, unlinkedArticle } =
      await createFixture();
    const externalUrl = 'https://outside.example/shared-story';

    await Hotlink.bulkCreate([
      {
        userId: user.id,
        feedId: feed.id,
        sourceArticleId: linkedArticle.id,
        url: externalUrl
      },
      {
        userId: user.id,
        feedId: feed.id,
        sourceArticleId: unlinkedArticle.id,
        url: externalUrl
      }
    ]);

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, links: '' });
    const externalLink = res.body.links.find(link => link.url === externalUrl);

    expect(res.status).toBe(200);
    expect(externalLink).toMatchObject({
      feed_id: 0,
      item_id: 0,
      temperature: 2,
      is_item: 0,
      is_local: 0,
      is_saved: 0,
      item_ids: [linkedArticle.id, unlinkedArticle.id]
        .sort((left, right) => left - right)
        .join(',')
    });
    expect(externalLink.id).toBeGreaterThan(0);
  });

  it('applies Hot Links date windows and 50-link pages', async () => {
    const { apiKey, user, feed, linkedArticle } = await createFixture();
    const recentCreatedAt = new Date();
    const oldCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const recentRows = Array.from({ length: 51 }, (_, index) => ({
      userId: user.id,
      feedId: feed.id,
      sourceArticleId: linkedArticle.id,
      url: `https://pagination.example/story-${String(index).padStart(2, '0')}`,
      createdAt: recentCreatedAt
    }));

    await Hotlink.bulkCreate([
      ...recentRows,
      {
        userId: user.id,
        feedId: feed.id,
        sourceArticleId: linkedArticle.id,
        url: 'https://outside.example/older-story',
        createdAt: oldCreatedAt
      }
    ]);

    const firstPage = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, links: '', page: '1' });
    const secondPage = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, links: '', page: '2' });
    const olderWindow = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        links: '',
        offset: '7',
        range: '7'
      });

    expect(firstPage.body.links).toHaveLength(50);
    expect(secondPage.body.links).toHaveLength(2);
    expect(
      firstPage.body.links
        .map(link => link.url)
        .filter(url => secondPage.body.links.some(link => link.url === url))
    ).toEqual([]);
    expect(new Set([
      ...firstPage.body.links.map(link => link.url),
      ...secondPage.body.links.map(link => link.url)
    ]).size).toBe(52);
    expect(firstPage.body.links.map(link => link.url)).not.toContain(
      'https://outside.example/older-story'
    );
    expect(olderWindow.body.links.map(link => link.url)).toContain(
      'https://outside.example/older-story'
    );
  });

  it('returns only sanitized article HTML in item payloads', async () => {
    const { apiKey, linkedArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, items: '', with_ids: String(linkedArticle.id) });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: linkedArticle.id,
        html: '<p>Sanitized Fever body</p>'
      })
    ]));
    expect(JSON.stringify(res.body)).not.toContain('rawFeverScript');
  });

  it('uses feed crawl times for refresh timestamps', async () => {
    const { apiKey, user, feed } = await createFixture();
    const lastFetched = new Date('2026-05-02T12:34:56Z');
    const newerLastFetched = new Date('2026-05-03T12:34:56Z');
    const category = await Category.findByPk(feed.categoryId);
    const newerFeed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Newer Fever Feed',
      url: 'https://example.com/newer-feed.xml',
      lastFetched: newerLastFetched
    });
    const expectedTimestamp = Math.floor(newerLastFetched.getTime() / 1000);

    await feed.update({ lastFetched });

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, feeds: '' });

    expect(res.status).toBe(200);
    expect(res.body.last_refreshed_on_time).toBe(String(expectedTimestamp));
    expect(
      res.body.feeds.find(resultFeed => resultFeed.id === feed.id)
        .last_updated_on_time
    ).toBe(Math.floor(lastFetched.getTime() / 1000));
    expect(
      res.body.feeds.find(resultFeed => resultFeed.id === newerFeed.id)
        .last_updated_on_time
    ).toBe(expectedTimestamp);
  });

  it('returns zero when the user has no completed feed refresh', async () => {
    const { apiKey, feed } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, feeds: '' });

    expect(res.status).toBe(200);
    expect(res.body.last_refreshed_on_time).toBe('0');
    expect(
      res.body.feeds.find(resultFeed => resultFeed.id === feed.id)
        .last_updated_on_time
    ).toBe(0);
  });

  it('returns the newest items when backward pagination starts with max_id zero', async () => {
    const { apiKey, linkedArticle, unlinkedArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, items: '', max_id: '0' });

    expect(res.status).toBe(200);
    expect(res.body.items.map(item => item.id)).toEqual([
      unlinkedArticle.id,
      linkedArticle.id
    ]);
  });

  it('returns no items when with_ids is explicitly empty', async () => {
    const { apiKey } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, items: '', with_ids: '' });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('pages exactly 50 items forward and backward without gaps or overlap', async () => {
    const { apiKey, user, feed, linkedArticle, unlinkedArticle } =
      await createFixture();
    const additionalArticles = await createPagingArticles(
      user,
      feed,
      103,
      'page-contract'
    );
    const allIds = [
      linkedArticle.id,
      unlinkedArticle.id,
      ...additionalArticles.map(article => article.id)
    ].sort((left, right) => left - right);

    const firstForward = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, items: '', since_id: '0' });
    const secondForward = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        items: '',
        since_id: String(firstForward.body.items.at(-1).id)
      });
    const thirdForward = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        items: '',
        since_id: String(secondForward.body.items.at(-1).id)
      });
    const firstBackward = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, items: '', max_id: '0' });
    const secondBackward = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        items: '',
        max_id: String(firstBackward.body.items.at(-1).id)
      });
    const thirdBackward = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        items: '',
        max_id: String(secondBackward.body.items.at(-1).id)
      });
    const forwardIds = [
      ...firstForward.body.items,
      ...secondForward.body.items,
      ...thirdForward.body.items
    ].map(item => item.id);
    const backwardIds = [
      ...firstBackward.body.items,
      ...secondBackward.body.items,
      ...thirdBackward.body.items
    ].map(item => item.id);

    expect([
      firstForward.body.items.length,
      secondForward.body.items.length,
      thirdForward.body.items.length
    ]).toEqual([50, 50, 5]);
    expect(forwardIds).toEqual(allIds);
    expect(new Set(forwardIds).size).toBe(allIds.length);
    expect([
      firstBackward.body.items.length,
      secondBackward.body.items.length,
      thirdBackward.body.items.length
    ]).toEqual([50, 50, 5]);
    expect(backwardIds).toEqual([...allIds].reverse());
    expect(new Set(backwardIds).size).toBe(allIds.length);
  });

  it('limits oversized with_ids selections to the first 50 unique ids', async () => {
    const { apiKey, user, feed } = await createFixture();
    const articles = await createPagingArticles(
      user,
      feed,
      55,
      'with-ids-contract'
    );
    const requestedIds = articles.map(article => article.id).reverse();
    const expectedIds = requestedIds
      .slice(0, 50)
      .sort((left, right) => left - right);

    const res = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        items: '',
        with_ids: requestedIds.join(',')
      });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(50);
    expect(res.body.items.map(item => item.id)).toEqual(expectedIds);
  });

  it('returns every requested read collection in one combined response', async () => {
    const { apiKey, feed, linkedArticle, unlinkedArticle } =
      await createFixture();
    await Promise.all([
      feed.update({
        favicon: `data:image/gif;base64,${TEST_FAVICON_BASE64}`
      }),
      linkedArticle.update({ favoriteInd: 1 })
    ]);

    const res = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        groups: '',
        feeds: '',
        favicons: '',
        items: '',
        with_ids: String(linkedArticle.id),
        links: '',
        unread_item_ids: '',
        saved_item_ids: ''
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      api_version: 3,
      auth: 1,
      groups: expect.any(Array),
      feeds: expect.any(Array),
      feeds_groups: expect.any(Array),
      favicons: expect.any(Array),
      items: expect.any(Array),
      links: expect.any(Array),
      unread_item_ids: expect.any(String),
      saved_item_ids: expect.any(String)
    }));
    expect(res.body.items.map(item => item.id)).toEqual([linkedArticle.id]);
    expect(res.body.unread_item_ids.split(',')).toEqual(expect.arrayContaining([
      String(linkedArticle.id),
      String(unlinkedArticle.id)
    ]));
    expect(res.body.saved_item_ids.split(',')).toContain(
      String(linkedArticle.id)
    );
    expect(res.body.favicons).toContainEqual({
      id: feed.id,
      data: `image/gif;base64,${TEST_FAVICON_BASE64}`
    });
  });

  it('keeps readAt synchronized with Fever read status changes', async () => {
    const { apiKey, linkedArticle } = await createFixture();

    const readResponse = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        mark: 'item',
        as: 'read',
        id: linkedArticle.id
      });

    await linkedArticle.reload();

    expect(readResponse.status).toBe(200);
    expect(linkedArticle.status).toBe('read');
    expect(linkedArticle.readAt).toBeInstanceOf(Date);
    expect(readResponse.body.unread_item_ids.split(',')).not.toContain(
      String(linkedArticle.id)
    );

    const unreadResponse = await request(app)
      .post('/api/fever')
      .query({
        api_key: apiKey,
        mark: 'item',
        as: 'unread',
        id: linkedArticle.id
      });

    await linkedArticle.reload();

    expect(unreadResponse.status).toBe(200);
    expect(linkedArticle.status).toBe('unread');
    expect(linkedArticle.readAt).toBeNull();
    expect(unreadResponse.body.unread_item_ids.split(',')).toContain(
      String(linkedArticle.id)
    );
  });

  it('safely applies item mutations to comma-separated ids', async () => {
    const { apiKey, linkedArticle, unlinkedArticle } = await createFixture();
    const { linkedArticle: otherUserArticle } = await createFixture();

    const res = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: apiKey,
        mark: 'item',
        as: 'read',
        id: [
          linkedArticle.id,
          unlinkedArticle.id,
          linkedArticle.id,
          otherUserArticle.id,
          'invalid',
          -1
        ].join(',')
      });

    await Promise.all([
      linkedArticle.reload(),
      unlinkedArticle.reload(),
      otherUserArticle.reload()
    ]);

    expect(res.status).toBe(200);
    expect(linkedArticle.status).toBe('read');
    expect(unlinkedArticle.status).toBe('read');
    expect(otherUserArticle.status).toBe('unread');
    expect(res.body.unread_item_ids.split(',')).not.toContain(
      String(linkedArticle.id)
    );
    expect(res.body.unread_item_ids.split(',')).not.toContain(
      String(unlinkedArticle.id)
    );
  });

  it('ignores unsupported mutation combinations without changing state', async () => {
    const { apiKey, feed, user, linkedArticle, unlinkedArticle } =
      await createFixture();
    const category = await Category.findOne({
      where: {
        userId: user.id
      }
    });
    const invalidMutations = [
      { mark: 'feed', as: 'saved', id: feed.id },
      { mark: 'feed', as: 'read', id: `${feed.id},999` },
      { mark: 'group', as: 'unread', id: category.id },
      { mark: 'group', as: 'read', id: -2 },
      { mark: 'item', as: 'deleted', id: linkedArticle.id },
      { mark: 'unknown', as: 'read', id: linkedArticle.id }
    ];

    for (const mutation of invalidMutations) {
      const res = await request(app)
        .post('/api/fever')
        .type('form')
        .send({
          api_key: apiKey,
          ...mutation
        });

      expect(res.status).toBe(200);
      expect(res.body.auth).toBe(1);
      expect(res.body).not.toHaveProperty('unread_item_ids');
      expect(res.body).not.toHaveProperty('saved_item_ids');
    }

    await Promise.all([
      linkedArticle.reload(),
      unlinkedArticle.reload()
    ]);

    expect(linkedArticle.status).toBe('unread');
    expect(linkedArticle.favoriteInd).toBe(0);
    expect(unlinkedArticle.status).toBe('unread');
    expect(unlinkedArticle.favoriteInd).toBe(0);
  });

  it('accepts seconds and milliseconds for feed mark-before cutoffs', async () => {
    const cutoff = new Date('2026-05-01T10:30:00Z');
    const beforeValues = [
      String(Math.floor(cutoff.getTime() / 1000)),
      String(cutoff.getTime())
    ];

    for (const before of beforeValues) {
      const { apiKey, feed, linkedArticle, unlinkedArticle } =
        await createFixture();
      const res = await request(app)
        .post('/api/fever')
        .type('form')
        .send({
          api_key: apiKey,
          mark: 'feed',
          as: 'read',
          id: feed.id,
          before
        });

      await Promise.all([
        linkedArticle.reload(),
        unlinkedArticle.reload()
      ]);

      expect(res.status).toBe(200);
      expect(linkedArticle.status).toBe('read');
      expect(unlinkedArticle.status).toBe('unread');
      expect(res.body.unread_item_ids.split(',')).not.toContain(
        String(linkedArticle.id)
      );
      expect(res.body.unread_item_ids.split(',')).toContain(
        String(unlinkedArticle.id)
      );
    }
  });

  it('enforces feed and group ownership while respecting before cutoffs', async () => {
    const owned = await createFixture();
    const other = await createFixture();
    const cutoff = String(
      Math.floor(new Date('2026-05-01T10:30:00Z').getTime() / 1000)
    );

    const foreignFeedResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: owned.apiKey,
        mark: 'feed',
        as: 'read',
        id: other.feed.id,
        before: cutoff
      });
    const foreignGroupResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: owned.apiKey,
        mark: 'group',
        as: 'read',
        id: other.feed.categoryId,
        before: cutoff
      });

    await Promise.all([
      owned.linkedArticle.reload(),
      owned.unlinkedArticle.reload(),
      other.linkedArticle.reload(),
      other.unlinkedArticle.reload()
    ]);

    expect(foreignFeedResponse.status).toBe(200);
    expect(foreignGroupResponse.status).toBe(200);
    expect(owned.linkedArticle.status).toBe('unread');
    expect(owned.unlinkedArticle.status).toBe('unread');
    expect(other.linkedArticle.status).toBe('unread');
    expect(other.unlinkedArticle.status).toBe('unread');

    const ownedFeedResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: owned.apiKey,
        mark: 'feed',
        as: 'read',
        id: owned.feed.id,
        before: cutoff
      });

    await Promise.all([
      owned.linkedArticle.reload(),
      owned.unlinkedArticle.reload()
    ]);

    expect(owned.linkedArticle.status).toBe('read');
    expect(owned.unlinkedArticle.status).toBe('unread');
    expect(ownedFeedResponse.body.unread_item_ids.split(',')).not.toContain(
      String(owned.linkedArticle.id)
    );
    expect(ownedFeedResponse.body.unread_item_ids.split(',')).toContain(
      String(owned.unlinkedArticle.id)
    );

    await owned.linkedArticle.update({
      status: 'unread',
      readAt: null
    });
    const ownedGroupResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: owned.apiKey,
        mark: 'group',
        as: 'read',
        id: owned.feed.categoryId,
        before: cutoff
      });

    await Promise.all([
      owned.linkedArticle.reload(),
      owned.unlinkedArticle.reload(),
      other.linkedArticle.reload(),
      other.unlinkedArticle.reload()
    ]);

    expect(owned.linkedArticle.status).toBe('read');
    expect(owned.unlinkedArticle.status).toBe('unread');
    expect(other.linkedArticle.status).toBe('unread');
    expect(other.unlinkedArticle.status).toBe('unread');
    expect(ownedGroupResponse.body.unread_item_ids.split(',')).not.toContain(
      String(owned.linkedArticle.id)
    );
    expect(ownedGroupResponse.body.unread_item_ids.split(',')).toContain(
      String(owned.unlinkedArticle.id)
    );
  });

  it('returns the current saved item ids after saved status changes', async () => {
    const { apiKey, linkedArticle } = await createFixture();

    const savedResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: apiKey,
        mark: 'item',
        as: 'saved',
        id: linkedArticle.id
      });

    expect(savedResponse.status).toBe(200);
    expect(savedResponse.body.saved_item_ids.split(',')).toContain(
      String(linkedArticle.id)
    );

    const unsavedResponse = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: apiKey,
        mark: 'item',
        as: 'unsaved',
        id: linkedArticle.id
      });

    expect(unsavedResponse.status).toBe(200);
    expect(unsavedResponse.body.saved_item_ids.split(',')).not.toContain(
      String(linkedArticle.id)
    );
  });

  it('uses readAt when marking recently read items as unread', async () => {
    const { apiKey, linkedArticle, unlinkedArticle } = await createFixture();
    const oldReadAt = new Date('2020-01-01T00:00:00Z');

    await linkedArticle.update({
      status: 'read',
      readAt: new Date()
    });
    await unlinkedArticle.update({
      status: 'read',
      readAt: oldReadAt
    });

    const res = await request(app)
      .post('/api/fever')
      .type('form')
      .send({
        api_key: apiKey,
        unread_recently_read: '1'
      });

    await Promise.all([
      linkedArticle.reload(),
      unlinkedArticle.reload()
    ]);

    expect(res.status).toBe(200);
    expect(linkedArticle.status).toBe('unread');
    expect(linkedArticle.readAt).toBeNull();
    expect(unlinkedArticle.status).toBe('read');
    expect(unlinkedArticle.readAt.getTime()).toBe(oldReadAt.getTime());
    expect(res.body.unread_item_ids.split(',')).toContain(
      String(linkedArticle.id)
    );
    expect(res.body.unread_item_ids.split(',')).not.toContain(
      String(unlinkedArticle.id)
    );
  });

  it('returns favicons only for feeds owned by the authenticated user', async () => {
    const { apiKey, feed, urlFeed, otherFeed } = await createFaviconFixture();

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, favicons: '' });

    expect(res.status).toBe(200);
    expect(res.body.auth).toBe(1);
    expect(res.body.favicons.map(favicon => favicon.id)).toContain(feed.id);
    expect(res.body.favicons).toContainEqual({
      id: feed.id,
      data: `image/gif;base64,${TEST_FAVICON_BASE64}`
    });
    expect(res.body.favicons.map(favicon => favicon.id)).not.toContain(urlFeed.id);
    expect(res.body.favicons.map(favicon => favicon.id)).not.toContain(otherFeed.id);
  });

  it('accepts every favicon image signature supported by Fever clients', async () => {
    const { apiKey, user, feed } = await createFaviconFixture();
    const faviconFormats = [
      ['image/jpeg', TEST_JPEG_FAVICON_BASE64],
      ['image/webp', TEST_WEBP_FAVICON_BASE64],
      ['image/x-icon', TEST_ICO_FAVICON_BASE64],
      ['image/vnd.microsoft.icon', TEST_ICO_FAVICON_BASE64]
    ];
    const feeds = await Promise.all(faviconFormats.map(([mimeType, data], index) =>
      Feed.create({
        userId: user.id,
        categoryId: feed.categoryId,
        feedName: `Signature ${index}`,
        url: `https://example.com/signature-${index}.xml`,
        favicon: `data:${mimeType};base64,${data}`
      })
    ));

    const res = await request(app)
      .post('/api/fever')
      .query({ api_key: apiKey, favicons: '' });

    for (const [index, faviconFeed] of feeds.entries()) {
      const [mimeType, data] = faviconFormats[index];
      expect(res.body.favicons).toContainEqual({
        id: faviconFeed.id,
        data: `${mimeType};base64,${data}`
      });
    }
  });
});
