import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { parseStringPromise } from 'xml2js';
import db from '../../models/index.js';

const {
  Article,
  Category,
  Feed,
  GeneratedFeed,
  Tag,
  User,
  sequelize
} = db;
let app;

const uniqueValue = prefix =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = prefix => {
  const username = uniqueValue(prefix);
  return User.create({
    username,
    password: 'hashed-password',
    feverCredentialHash: `${username}-hash`,
    role: 'user'
  });
};

const createFeedFor = async user => {
  const category = await Category.create({
    userId: user.id,
    name: uniqueValue('Generated Feed category')
  });

  return Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueValue('Generated Feed source'),
    feedDesc: 'Generated Feed test source',
    url: `https://example.test/${uniqueValue('feed')}.xml`
  });
};

const createTaggedArticle = async ({ user, feed, title, publishedAt, tag = 'security' }) => {
  const article = await Article.create({
    userId: user.id,
    feedId: feed.id,
    title,
    url: `https://example.test/${encodeURIComponent(title)}`,
    contentHtml: `<p>${title} body</p>`,
    publishedAt
  });
  if (tag) {
    await Tag.create({ userId: user.id, articleId: article.id, name: tag });
  }
  return article;
};

const tokenFor = character => character.repeat(43);
const normalizedOrder = order => order.map(([field, direction]) => [
  field,
  String(direction?.val ?? direction).trim()
]);

describe('public Generated Feed RSS endpoint', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  it('renders the owner-scoped expression through the shared RSS format without JWT auth', async () => {
    const owner = await createUser('generated-rss-owner');
    const otherUser = await createUser('generated-rss-other');
    const ownerFeed = await createFeedFor(owner);
    const otherFeed = await createFeedFor(otherUser);
    const olderTitle = uniqueValue('Older matching article');
    const newerTitle = uniqueValue('Newer matching article');
    const excludedTitle = uniqueValue('Excluded article');
    const foreignTitle = uniqueValue('Foreign matching article');

    await createTaggedArticle({
      user: owner,
      feed: ownerFeed,
      title: olderTitle,
      publishedAt: new Date('2026-08-01T10:00:00Z')
    });
    await createTaggedArticle({
      user: owner,
      feed: ownerFeed,
      title: newerTitle,
      publishedAt: new Date('2026-08-02T10:00:00Z')
    });
    await createTaggedArticle({
      user: owner,
      feed: ownerFeed,
      title: excludedTitle,
      publishedAt: new Date('2026-08-03T10:00:00Z'),
      tag: 'other'
    });
    await createTaggedArticle({
      user: otherUser,
      feed: otherFeed,
      title: foreignTitle,
      publishedAt: new Date('2026-08-04T10:00:00Z')
    });

    const token = tokenFor('a');
    await GeneratedFeed.create({
      userId: owner.id,
      name: 'Security & Privacy',
      description: 'Selected <security> reporting',
      expression: 'tag:security sort:desc',
      token,
      enabled: true
    });

    const response = await request(app).get(`/rss/generated/${token}`);
    const invalidJwtResponse = await request(app)
      .get(`/rss/generated/${token}`)
      .set('Authorization', 'Bearer invalid-jwt');

    expect(response.status).toBe(200);
    expect(invalidJwtResponse.status).toBe(200);
    expect(invalidJwtResponse.headers['content-type']).toMatch(/^application\/rss\+xml/);
    expect(invalidJwtResponse.text).toContain(newerTitle);
    expect(response.headers['content-type']).toMatch(/^application\/rss\+xml/);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.text).toContain('<title><![CDATA[RSSMonster - Security & Privacy]]></title>');
    expect(response.text).toContain('<description><![CDATA[Selected <security> reporting]]></description>');
    expect(response.text).toContain(newerTitle);
    expect(response.text).toContain(olderTitle);
    expect(response.text.indexOf(newerTitle)).toBeLessThan(response.text.indexOf(olderTitle));
    expect(response.text).not.toContain(excludedTitle);
    expect(response.text).not.toContain(foreignTitle);
    expect(response.text).toContain(`/rss/generated/${token}`);

    const parsed = await parseStringPromise(response.text);
    const channel = parsed.rss.channel[0];
    const firstItem = channel.item[0];
    expect(parsed.rss.$['xmlns:atom']).toBe('http://www.w3.org/2005/Atom');
    const atomSelfLink = channel['atom:link'][0].$;
    expect(new URL(atomSelfLink.href).pathname).toBe(`/rss/generated/${token}`);
    expect(response.headers['content-location']).toBe(atomSelfLink.href);
    expect(atomSelfLink).toMatchObject({
      rel: 'self',
      type: 'application/rss+xml'
    });
    expect(firstItem.guid[0].$).toEqual({ isPermaLink: 'false' });
    expect(firstItem.guid[0]._).toMatch(
      /\/rss\/items\/\d+$/
    );
    expect(firstItem.category[0]).toBe(ownerFeed.feedName);
  });

  it('returns the same not-found response for missing, disabled, and regenerated tokens', async () => {
    const owner = await createUser('generated-rss-token-state');
    const oldToken = tokenFor('b');
    const newToken = tokenFor('c');
    const generatedFeed = await GeneratedFeed.create({
      userId: owner.id,
      name: 'Token state feed',
      expression: 'unread:true',
      token: oldToken,
      enabled: false
    });

    const malformed = await request(app).get('/rss/generated/not-a-token');
    const missing = await request(app).get(`/rss/generated/${tokenFor('d')}`);
    const disabled = await request(app).get(`/rss/generated/${oldToken}`);
    await generatedFeed.update({ enabled: true, token: newToken, tokenRegeneratedAt: new Date() });
    const regenerated = await request(app).get(`/rss/generated/${oldToken}`);
    const current = await request(app).get(`/rss/generated/${newToken}`);

    for (const response of [malformed, missing, disabled, regenerated]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Generated Feed not found' });
    }
    expect(current.status).toBe(200);
  });

  it('caps the rendered document at fifty articles even when the expression requests more', async () => {
    const owner = await createUser('generated-rss-limit');
    const feed = await createFeedFor(owner);
    const token = tokenFor('e');
    const articles = Array.from({ length: 55 }, (_, index) => ({
      userId: owner.id,
      feedId: feed.id,
      title: `Generated limit item ${String(index).padStart(2, '0')} ${uniqueValue('title')}`,
      url: `https://example.test/generated-limit-${index}-${Date.now()}`,
      contentHtml: `<p>Generated limit body ${index}</p>`,
      advertisementScore: index === 0 ? 100 : 10,
      sentimentScore: index === 0 ? 100 : 10,
      qualityScore: index === 0 ? 100 : 10,
      publishedAt: new Date(Date.UTC(2026, 7, 1, 0, index))
    }));
    const createdArticles = await Article.bulkCreate(articles);
    await Tag.bulkCreate(createdArticles.map(article => ({
      userId: owner.id,
      articleId: article.id,
      name: 'generated-limit'
    })));
    const generatedFeed = await GeneratedFeed.create({
      userId: owner.id,
      name: 'Bounded feed',
      expression: 'tag:generated-limit sort:desc limit:200',
      token,
      enabled: true
    });

    const findOptions = [];
    const hookName = uniqueValue('generated-feed-bounds');
    Article.addHook('beforeFind', hookName, options => findOptions.push(options));
    let response;
    try {
      response = await request(app).get(`/rss/generated/${token}`);
    } finally {
      Article.removeHook('beforeFind', hookName);
    }
    const itemCount = (response.text.match(/<item>/g) || []).length;
    const chronologicalQuery = findOptions.find(options =>
      Array.isArray(options.attributes) && options.attributes.includes('aiAnalysisStatus')
    );

    expect(response.status).toBe(200);
    expect(itemCount).toBe(50);
    expect(chronologicalQuery.limit).toBe(50);
    expect(normalizedOrder(chronologicalQuery.order)).toEqual([
      ['publishedAt', 'DESC'],
      ['id', 'DESC']
    ]);
    expect(response.text).toContain('Generated limit body 54');
    expect(response.text).not.toContain('Generated limit body 0</p>');

    await generatedFeed.update({ expression: 'tag:generated-limit sort:quality limit:200' });
    const rankedFindOptions = [];
    Article.addHook('beforeFind', hookName, options => rankedFindOptions.push(options));
    let rankedResponse;
    try {
      rankedResponse = await request(app).get(`/rss/generated/${token}`);
    } finally {
      Article.removeHook('beforeFind', hookName);
    }
    const rankedQuery = rankedFindOptions.find(options =>
      Array.isArray(options.attributes) && options.attributes.includes('qualityScore')
    );

    expect((rankedResponse.text.match(/<item>/g) || [])).toHaveLength(50);
    expect(rankedQuery.limit).toBe(500);
    expect(normalizedOrder(rankedQuery.order)).toEqual([
      ['publishedAt', 'DESC'],
      ['id', 'DESC']
    ]);
    expect(rankedResponse.text).toContain('Generated limit body 0</p>');
  });
});
