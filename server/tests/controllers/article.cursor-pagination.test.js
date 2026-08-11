import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { createArticleSearchCursor } from '../../services/articleSearch/articleSearchCursor.service.js';

const { Article, Category, Feed, User, sequelize } = db;
let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const authHeaderFor = user => `Bearer ${jwt.sign({
  username: user.username,
  userId: user.id
}, getJwtSecret())}`;

const createUserFeed = async prefix => {
  const user = await User.create({
    username: uniqueName(`${prefix}-user`),
    password: 'hashed-password',
    feverCredentialHash: uniqueName(`${prefix}-hash`),
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: uniqueName(`${prefix}-category`),
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueName(`${prefix}-feed`),
    url: `https://example.com/${uniqueName(prefix)}.xml`
  });
  return { user, category, feed };
};

const createArticle = (user, feed, title, publishedAt, values = {}) => Article.create({
  userId: user.id,
  feedId: feed.id,
  status: 'unread',
  url: `https://example.com/${uniqueName('cursor-article')}`,
  title,
  publishedAt,
  ...values
});

const getPage = (user, query = {}) => request(app)
  .get('/api/articles')
  .query({
    pagination: 'cursor',
    pageSize: 2,
    status: 'unread',
    categoryId: '%',
    feedId: '%',
    sort: 'desc',
    ...query
  })
  .set('Authorization', authHeaderFor(user));

describe('article cursor pagination', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    const mod = await import('../../app.js');
    app = mod.default;
    await sequelize.authenticate();
  }, 50_000);

  it('returns every article once across deterministic pages with identical timestamps', async () => {
    const { user, feed } = await createUserFeed('cursor-pages');
    const sharedTime = new Date('2026-08-10T12:00:00.000Z');
    const articles = await Promise.all([
      createArticle(user, feed, 'First', sharedTime),
      createArticle(user, feed, 'Second', sharedTime),
      createArticle(user, feed, 'Third', new Date('2026-08-09T12:00:00.000Z')),
      createArticle(user, feed, 'Fourth', new Date('2026-08-08T12:00:00.000Z')),
      createArticle(user, feed, 'Fifth', new Date('2026-08-07T12:00:00.000Z'))
    ]);

    const first = await getPage(user);
    const second = await getPage(user, { cursor: first.body.page.nextCursor });
    const third = await getPage(user, { cursor: second.body.page.nextCursor });
    const returnedIds = [first, second, third].flatMap(response => response.body.page.itemIds);
    const expectedIds = [...articles]
      .sort((left, right) => (
        right.publishedAt.getTime() - left.publishedAt.getTime()
        || right.id - left.id
      ))
      .map(article => article.id);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      paginationVersion: 1,
      page: { hasMore: true }
    });
    expect(first.body.snapshot.snapshotMaxArticleId).toBeGreaterThanOrEqual(Math.max(...expectedIds));
    expect(first.body.page.articles.map(article => article.id)).toEqual(first.body.page.itemIds);
    expect(second.body.page.hasMore).toBe(true);
    expect(third.body.page.hasMore).toBe(false);
    expect(returnedIds).toEqual(expectedIds);
    expect(new Set(returnedIds).size).toBe(returnedIds.length);

    const ascFirst = await getPage(user, { sort: 'asc' });
    const ascSecond = await getPage(user, {
      sort: 'asc',
      cursor: ascFirst.body.page.nextCursor
    });
    const ascThird = await getPage(user, {
      sort: 'asc',
      cursor: ascSecond.body.page.nextCursor
    });
    const ascendingIds = [ascFirst, ascSecond, ascThird]
      .flatMap(response => response.body.page.itemIds);
    expect(ascendingIds).toEqual([...expectedIds].reverse());
    expect(new Set(ascendingIds).size).toBe(ascendingIds.length);
  });

  it('excludes new inserts and tolerates deletion and filter departure between pages', async () => {
    const { user, feed } = await createUserFeed('cursor-mutations');
    const articles = await Promise.all([
      createArticle(user, feed, 'Newest', new Date('2026-08-10T12:00:00.000Z')),
      createArticle(user, feed, 'Second', new Date('2026-08-09T12:00:00.000Z')),
      createArticle(user, feed, 'Deleted', new Date('2026-08-08T12:00:00.000Z')),
      createArticle(user, feed, 'Leaves filter', new Date('2026-08-07T12:00:00.000Z')),
      createArticle(user, feed, 'Remaining', new Date('2026-08-06T12:00:00.000Z'))
    ]);
    const first = await getPage(user);
    const inserted = await createArticle(
      user,
      feed,
      'Inserted after snapshot',
      new Date('2026-08-11T12:00:00.000Z')
    );
    await articles[2].destroy();
    await articles[3].update({ status: 'read' });

    const second = await getPage(user, { cursor: first.body.page.nextCursor });

    expect(second.status).toBe(200);
    expect(second.body.page.itemIds).toEqual([articles[4].id]);
    expect(second.body.page.itemIds).not.toContain(inserted.id);
    expect(second.body.page.hasMore).toBe(false);
  });

  it('paginates trust order and isolates cursor ownership', async () => {
    const { user, category } = await createUserFeed('cursor-trust');
    const highTrustFeed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: uniqueName('high-trust'),
      url: `https://example.com/${uniqueName('high-trust')}.xml`,
      feedTrust: 0.9
    });
    const lowTrustFeed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: uniqueName('low-trust'),
      url: `https://example.com/${uniqueName('low-trust')}.xml`,
      feedTrust: 0.2
    });
    const lowNewest = await createArticle(user, lowTrustFeed, 'Low newest', new Date('2026-08-11T12:00:00Z'));
    const highOlder = await createArticle(user, highTrustFeed, 'High older', new Date('2026-08-09T12:00:00Z'));
    const first = await getPage(user, { sort: 'trust', pageSize: 1 });
    const second = await getPage(user, {
      sort: 'trust',
      pageSize: 1,
      cursor: first.body.page.nextCursor
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.page.itemIds).toEqual([highOlder.id]);
    expect(second.body.page.itemIds).toEqual([lowNewest.id]);

    const { user: otherUser } = await createUserFeed('cursor-other-user');
    const foreignResponse = await getPage(otherUser, {
      sort: 'trust',
      pageSize: 1,
      cursor: first.body.page.nextCursor
    });
    expect(foreignResponse.status).toBe(403);
    expect(foreignResponse.body.error.code).toBe('CURSOR_USER_MISMATCH');
  });

  it('rejects mismatched, invalid, expired, unsupported, and invalid-size requests', async () => {
    const { user, feed } = await createUserFeed('cursor-validation');
    await Promise.all([
      createArticle(user, feed, 'Newer', new Date('2026-08-10T12:00:00Z')),
      createArticle(user, feed, 'Older', new Date('2026-08-09T12:00:00Z'))
    ]);
    const first = await getPage(user, { pageSize: 1 });
    const mismatch = await getPage(user, {
      pageSize: 1,
      sort: 'asc',
      cursor: first.body.page.nextCursor
    });
    const invalid = await getPage(user, { cursor: 'not-a-valid-cursor' });
    const unsupported = await getPage(user, { sort: 'recommended' });
    const invalidSize = await getPage(user, { pageSize: 101 });

    const [encodedPayload] = first.body.page.nextCursor.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const expiredCursor = createArticleSearchCursor({
      userId: payload.userId,
      queryHash: payload.queryHash,
      sort: payload.sort,
      snapshotMaxArticleId: payload.snapshotMaxArticleId,
      position: payload.position,
      consumedCount: payload.consumedCount,
      now: Date.now() - 1000,
      ttlMs: 1
    });
    const expired = await getPage(user, { pageSize: 1, cursor: expiredCursor });

    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('CURSOR_QUERY_MISMATCH');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('CURSOR_MALFORMED');
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe('CURSOR_EXPIRED');
    expect(unsupported.status).toBe(422);
    expect(unsupported.body.error.code).toBe('CURSOR_SORT_UNSUPPORTED');
    expect(invalidSize.status).toBe(400);
    expect(invalidSize.body.error.code).toBe('PAGE_SIZE_INVALID');
  });

  it('passes pageSize plus one as the Sequelize search limit', async () => {
    const { user, feed } = await createUserFeed('cursor-limit');
    await Promise.all([
      createArticle(user, feed, 'One', new Date('2026-08-10T12:00:00Z')),
      createArticle(user, feed, 'Two', new Date('2026-08-09T12:00:00Z')),
      createArticle(user, feed, 'Three', new Date('2026-08-08T12:00:00Z'))
    ]);
    const findAllSpy = vi.spyOn(Article, 'findAll');

    try {
      const response = await getPage(user, { pageSize: 2 });
      expect(response.status).toBe(200);
      expect(findAllSpy.mock.calls.some(([options]) => options?.limit === 3)).toBe(true);
    } finally {
      findAllSpy.mockRestore();
    }
  });

  it('does not return more rows than a bounded search permits', async () => {
    const { user, feed } = await createUserFeed('cursor-bounded-limit');
    const articles = await Promise.all([
      createArticle(user, feed, 'One', new Date('2026-08-10T12:00:00Z')),
      createArticle(user, feed, 'Two', new Date('2026-08-09T12:00:00Z')),
      createArticle(user, feed, 'Three', new Date('2026-08-08T12:00:00Z')),
      createArticle(user, feed, 'Beyond limit', new Date('2026-08-07T12:00:00Z'))
    ]);

    const first = await getPage(user, { pageSize: 2, search: 'limit:3' });
    const second = await getPage(user, {
      pageSize: 2,
      search: 'limit:3',
      cursor: first.body.page.nextCursor
    });
    const returnedIds = [...first.body.page.itemIds, ...second.body.page.itemIds];

    expect(first.status).toBe(200);
    expect(first.body.totalCount).toBe(3);
    expect(first.body.page.hasMore).toBe(true);
    expect(second.status).toBe(200);
    expect(second.body.totalCount).toBe(3);
    expect(second.body.page.itemIds).toHaveLength(1);
    expect(second.body.page.hasMore).toBe(false);
    expect(second.body.page.nextCursor).toBeNull();
    expect(returnedIds).toEqual(articles.slice(0, 3).map(article => article.id));
    expect(returnedIds).not.toContain(articles[3].id);
  });

  it('counts newer articles within the active source scope', async () => {
    const { user, category, feed } = await createUserFeed('cursor-newer-scope');
    const initial = await createArticle(
      user,
      feed,
      'Initial article',
      new Date('2026-08-10T12:00:00Z')
    );
    const otherCategory = await Category.create({
      userId: user.id,
      name: uniqueName('cursor-newer-other-category'),
      categoryOrder: 2
    });
    const otherFeed = await Feed.create({
      userId: user.id,
      categoryId: otherCategory.id,
      feedName: uniqueName('cursor-newer-other-feed'),
      url: `https://example.com/${uniqueName('cursor-newer-other-feed')}.xml`
    });
    await createArticle(user, otherFeed, 'Unrelated newer article', new Date('2026-08-11T12:00:00Z'));

    const noMatch = await request(app)
      .get('/api/articles')
      .query({
        newerThanArticleId: initial.id,
        status: 'unread',
        categoryId: category.id,
        feedId: '%',
        sort: 'desc'
      })
      .set('Authorization', authHeaderFor(user));

    expect(noMatch.status).toBe(200);
    expect(noMatch.body).toEqual({ newerArticleCount: 0 });

    await createArticle(user, feed, 'Matching newer article', new Date('2026-08-11T13:00:00Z'));
    const matching = await request(app)
      .get('/api/articles')
      .query({
        newerThanArticleId: initial.id,
        status: 'unread',
        categoryId: category.id,
        feedId: '%',
        sort: 'desc'
      })
      .set('Authorization', authHeaderFor(user));

    expect(matching.status).toBe(200);
    expect(matching.body).toEqual({ newerArticleCount: 1 });
  });
});
