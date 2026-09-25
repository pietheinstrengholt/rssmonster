import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { createArticleSearchCursor } from '../../services/articleSearch/articleSearchCursor.service.js';
import { MAX_ARTICLE_SEARCH_LENGTH } from '../../services/articleSearch/articleQueryParser.service.js';

const { Article, Category, Event, Feed, Setting, Tag, User, sequelize } = db;
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

  it('applies both calendar bounds to lists, arrivals and matching bulk actions', async () => {
    const { user, category, feed } = await createUserFeed('calendar-range');
    const old = await createArticle(user, feed, 'Science old', new Date('2026-01-01T09:00:00Z'));
    const start = await createArticle(user, feed, 'Science start', new Date('2026-01-01T10:00:00Z'));
    const middle = await createArticle(user, feed, 'Science middle', new Date('2026-01-01T11:00:00Z'));
    const end = await createArticle(user, feed, 'Science end', new Date('2026-01-01T12:00:00Z'));
    await createArticle(user, feed, 'Science backdated arrival', new Date('2026-01-01T09:30:00Z'));
    const query = {
      categoryId: category.id, feedId: feed.id, status: 'unread', persistSettings: false,
      search: `title:Science @2026-01-01 unread:true id:>${old.id}`,
      publishedAfter: '2026-01-01T10:00:00.000Z', publishedBefore: '2026-01-01T12:00:00.000Z'
    };
    for (const grouping of ['none', 'event']) {
      const first = await getPage(user, { ...query, grouping, sort: 'asc', pageSize: 1 });
      expect(first.status).toBe(200);
      expect(first.body.page.itemIds).toEqual([start.id]);
      const second = await getPage(user, { ...query, grouping, sort: 'asc', pageSize: 1, cursor: first.body.page.nextCursor });
      expect(second.status).toBe(200);
      expect(second.body.page.itemIds).toEqual([middle.id]);
      const mismatch = await getPage(user, { ...query, grouping, sort: 'asc', pageSize: 1, cursor: first.body.page.nextCursor, publishedBefore: '2026-01-01T11:00:00Z' });
      expect(mismatch.status).toBe(409);
      const ranked = await request(app).get('/api/articles').query({ ...query, grouping, sort: 'quality' }).set('Authorization', authHeaderFor(user));
      expect(ranked.status).toBe(200);
      expect(ranked.body.itemIds.sort((a, b) => a - b)).toEqual([start.id, middle.id]);
    }
    const count = await request(app).get('/api/articles').query({ ...query, newerThanArticleId: old.id }).set('Authorization', authHeaderFor(user));
    expect(count.body.newerArticleCount).toBe(2);
    const empty = await getPage(user, { ...query, publishedAfter: '2026-01-01T13:00:00Z' });
    expect(empty.status).toBe(200);
    expect(empty.body.totalCount).toBe(0);
    const marked = await request(app).post('/api/articles/markasread').send({ ...query, sort: 'desc', scope: 'matching' }).set('Authorization', authHeaderFor(user));
    expect(marked.status).toBe(200);
    expect(marked.body.matchedCount).toBe(2);
    expect((await end.reload()).status).toBe('unread');
    const invalid = await getPage(user, { publishedBefore: 'invalid' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('PUBLISHED_BEFORE_INVALID');
  });

  it('intersects publication age with scoped search, arrivals, Events and matching mark-as-read', async () => {
    const { user, category, feed } = await createUserFeed('age-cutoff');
    const other = await createUserFeed('age-cutoff-other');
    const old = await createArticle(user, feed, 'Science old', new Date('2026-01-01T11:59:59Z'));
    const boundary = await createArticle(user, feed, 'Science boundary', new Date('2026-01-01T12:00:00Z'));
    const recent = await createArticle(user, feed, 'Science recent', new Date('2026-01-01T13:00:00Z'));
    const backdated = await createArticle(user, feed, 'Science backdated', new Date('2026-01-01T11:59:59Z'));
    const event = await Event.create({ userId: user.id, representativeArticleId: boundary.id });
    await backdated.update({ eventId: event.id });
    await boundary.update({ eventId: event.id });
    await createArticle(user, feed, 'Unrelated', new Date('2026-01-01T14:00:00Z'));
    await createArticle(user, feed, 'Science tomorrow', new Date('2026-01-02T14:00:00Z'));
    await createArticle(user, feed, 'Science read', new Date('2026-01-01T14:00:00Z'), { status: 'read' });
    await createArticle(other.user, other.feed, 'Science private', new Date('2026-01-01T14:00:00Z'));
    const query = {
      status: 'unread', categoryId: category.id, feedId: feed.id, sort: 'asc',
      search: `title:Science @2026-01-01 unread:true id:>${old.id}`,
      publishedAfter: '2026-01-01T12:00:00.000Z', persistSettings: false
    };
    for (const grouping of ['none', 'event']) {
      const page = await getPage(user, { ...query, grouping, pageSize: 1 });
      expect(page.status).toBe(200);
      expect(page.body.totalCount).toBe(2);
      expect(page.body.page.itemIds).toEqual([boundary.id]);
      const next = await getPage(user, { ...query, grouping, pageSize: 1, cursor: page.body.page.nextCursor });
      expect(next.status).toBe(200);
      expect(next.body.page.itemIds).toEqual([recent.id]);
      const mismatch = await getPage(user, { ...query, grouping, pageSize: 1, cursor: page.body.page.nextCursor, publishedAfter: '2026-01-01T13:00:00.000Z' });
      expect(mismatch.status).toBe(409);
      const legacy = await request(app).get('/api/articles').query({ ...query, grouping, sort: 'quality' }).set('Authorization', authHeaderFor(user));
      expect(legacy.status).toBe(200);
      expect(legacy.body.itemIds.sort((a, b) => a - b)).toEqual([boundary.id, recent.id]);
    }
    const count = await request(app).get('/api/articles').query({ ...query, newerThanArticleId: old.id }).set('Authorization', authHeaderFor(user));
    expect(count.status).toBe(200);
    expect(count.body.newerArticleCount).toBe(2);
    const marked = await request(app).post('/api/articles/markasread').send({ ...query, scope: 'matching' }).set('Authorization', authHeaderFor(user));
    expect(marked.status).toBe(200);
    expect(marked.body.matchedCount).toBe(2);
    expect((await old.reload()).status).toBe('unread');
  });

  it.each(['invalid', '', '2026-01-01'])('rejects malformed publication cutoffs (%j)', async publishedAfter => {
    const { user } = await createUserFeed('invalid-age');
    const response = await getPage(user, { publishedAfter });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PUBLISHED_AFTER_INVALID');
  });

  it('uses the same scoped unread ID expression for counts and paginated results', async () => {
    const { user, category, feed } = await createUserFeed('new-only');
    const other = await createUserFeed('new-only-other');
    const old = await createArticle(user, feed, 'Science old', new Date('2026-01-01'));
    const fresh = await createArticle(user, feed, 'Science fresh', new Date('2026-01-02'));
    await createArticle(user, feed, 'Science read', new Date('2026-01-03'), { status: 'read' });
    await createArticle(user, feed, 'Unrelated title', new Date('2026-01-04'));
    await createArticle(other.user, other.feed, 'Science private', new Date('2026-01-05'));
    const query = {
      status: 'unread', categoryId: category.id, feedId: feed.id, sort: 'asc',
      search: `title:Science unread:true read:false id:>${old.id}`, persistSettings: false
    };
    const count = await request(app).get('/api/articles')
      .query({ ...query, newerThanArticleId: old.id }).set('Authorization', authHeaderFor(user));
    const page = await getPage(user, query);
    const ranked = await request(app).get('/api/articles')
      .query({ ...query, sort: 'quality' }).set('Authorization', authHeaderFor(user));
    expect(count.status).toBe(200);
    expect(count.body.newerArticleCount).toBe(1);
    expect(page.status).toBe(200);
    expect(page.body.page.itemIds).toEqual([fresh.id]);
    expect(ranked.status).toBe(200);
    expect(ranked.body.itemIds).toEqual([fresh.id]);
  });

  it('rejects oversized search expressions before executing a search', async () => {
    const { user } = await createUserFeed('oversized-search');
    const response = await getPage(user, { search: 'x'.repeat(MAX_ARTICLE_SEARCH_LENGTH + 1) });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'SEARCH_TOO_LONG',
      message: `search must not exceed ${MAX_ARTICLE_SEARCH_LENGTH} characters.`
    });
  });

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

  it('reports the oldest matching publication before the age cutoff, regardless of page size', async () => {
    const { user, feed } = await createUserFeed('oldest-age-metadata');
    const oldest = await createArticle(user, feed, 'Range science oldest', new Date('2026-09-01T12:00:00Z'));
    await createArticle(user, feed, 'Range science middle', new Date('2026-09-20T12:00:00Z'));
    await createArticle(user, feed, 'Range science newest', new Date('2026-09-24T12:00:00Z'));
    await createArticle(user, feed, 'Unrelated older', new Date('2026-01-01T12:00:00Z'));
    const query = {
      feedId: feed.id, search: 'title:Range', persistSettings: false,
      includeOldestPublishedAt: true, ageCutoff: '7d',
      publishedAfter: '2026-09-18T12:00:00Z', publishedBefore: '2026-09-25T12:00:00Z'
    };
    const first = await getPage(user, { ...query, pageSize: 1 });
    const larger = await getPage(user, { ...query, pageSize: 2 });
    const legacy = await request(app).get('/api/articles').query({ ...query, sort: 'quality' })
      .set('Authorization', authHeaderFor(user));
    expect(first.status).toBe(200);
    expect(larger.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(first.body.totalCount).toBe(2);
    expect(first.body.page.itemIds).toHaveLength(1);
    expect(legacy.body.itemIds).toHaveLength(2);
    expect(first.body.oldestPublishedAt).toBe(oldest.publishedAt.toISOString());
    expect(larger.body.oldestPublishedAt).toBe(oldest.publishedAt.toISOString());
    expect(legacy.body.oldestPublishedAt).toBe(oldest.publishedAt.toISOString());
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

  it.each(['trust', 'attention'])('falls back to newest pagination for removed sort %s', async sort => {
    const { user, feed } = await createUserFeed(`cursor-removed-${sort}`);
    const article = await createArticle(user, feed, 'Removed sort fallback', new Date('2026-08-11T12:00:00Z'));

    const response = await getPage(user, { sort, pageSize: 1 });

    expect(response.status).toBe(200);
    expect(response.body.page.itemIds).toEqual([article.id]);
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

  it('checks ranked query arrivals with event grouping and ownership without saving settings', async () => {
    const { user, feed } = await createUserFeed('ranked-arrivals');
    const other = await createUserFeed('ranked-arrivals-other');
    const initial = await createArticle(user, feed, 'Science initial', new Date());
    const event = await Event.create({ userId: user.id, representativeArticleId: initial.id });
    await initial.update({ eventId: event.id });
    const query = { status: 'unread', search: 'title:Science unread:true', sort: 'recommended', grouping: 'event', feedId: feed.id };
    const first = await request(app).get('/api/articles').query(query).set('Authorization', authHeaderFor(user));
    expect(first.status).toBe(200);
    const boundary = first.body.snapshot.snapshotMaxArticleId;
    expect(boundary).toBe(initial.id);
    await Setting.update({ sort: 'quality', grouping: 'event' }, { where: { userId: user.id } });

    await createArticle(user, feed, 'Science grouped member', new Date(), { eventId: event.id });
    await createArticle(user, feed, 'Science read', new Date(), { status: 'read' });
    await createArticle(user, feed, 'Unrelated title', new Date());
    await createArticle(other.user, other.feed, 'Science other user', new Date());
    const count = () => request(app).get('/api/articles')
      .query({ ...query, newerThanArticleId: boundary }).set('Authorization', authHeaderFor(user));
    expect((await count()).body).toEqual({ newerArticleCount: 0 });

    await createArticle(user, feed, 'Science matching arrival', new Date());
    expect((await count()).body).toEqual({ newerArticleCount: 1 });
    expect(await Setting.findOne({ where: { userId: user.id }, raw: true }))
      .toMatchObject({ sort: 'quality', grouping: 'event' });
  });

  it('returns a snapshot for an empty ranked query and detects its first matching arrival', async () => {
    const { user, feed } = await createUserFeed('empty-ranked-arrivals');
    const query = { sort: 'recommended', grouping: 'event', feedId: feed.id };
    const first = await request(app).get('/api/articles').query(query).set('Authorization', authHeaderFor(user));
    expect(first.status).toBe(200);
    expect(first.body.itemIds).toEqual([]);
    expect(first.body.snapshot).toMatchObject({ snapshotMaxArticleId: 0, highestUnreadArticleId: 0 });
    await createArticle(user, feed, 'First arrival', new Date());
    const count = await request(app).get('/api/articles')
      .query({ ...query, newerThanArticleId: 0 }).set('Authorization', authHeaderFor(user));
    expect(count.body).toEqual({ newerArticleCount: 1 });
  });

  it.each(['read', 'favorite', 'hot', 'clicked', '%'])('enforces unread arrivals even when the request status is %s', async status => {
    const { user, category, feed } = await createUserFeed('unread-only-arrivals');
    const initial = await createArticle(user, feed, 'Science initial', new Date());
    const readArticle = await createArticle(user, feed, 'Science read arrival', new Date(), {
      status: 'read', favoriteInd: 1, hotInd: 1, clickedAmount: 2
    });
    const query = { status, categoryId: category.id, feedId: feed.id, sort: 'recommended', newerThanArticleId: initial.id };
    const count = search => request(app).get('/api/articles')
      .query({ ...query, search }).set('Authorization', authHeaderFor(user));
    expect((await count('title:Science')).body).toEqual({ newerArticleCount: 0 });

    await createArticle(user, feed, 'Science unread arrival', new Date());
    await createArticle(user, feed, 'Different topic', new Date());
    for (const search of ['title:Science', 'title:Science read:true', 'title:Science unread:false']) {
      const response = await count(search);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ newerArticleCount: 1 });
    }

    const normalReadList = await request(app).get('/api/articles')
      .query({ feedId: feed.id, search: 'title:Science read:true' }).set('Authorization', authHeaderFor(user));
    expect(normalReadList.body.itemIds).toEqual([readArticle.id]);
  });

  it.each(['recommended', 'desc'])('detects the first arrival for an initially empty tag with %s sorting', async sort => {
    const { user, feed } = await createUserFeed('empty-tag-arrivals');
    const initial = await createArticle(user, feed, 'Untagged existing article', new Date());
    const tag = uniqueName('new-tag');
    const query = { sort, tag, feedId: feed.id, grouping: 'event' };
    const first = await request(app).get('/api/articles')
      .query({ ...query, ...(sort === 'desc' ? { pagination: 'cursor' } : {}) })
      .set('Authorization', authHeaderFor(user));
    expect(first.status).toBe(200);
    expect(first.body.snapshot.snapshotMaxArticleId).toBe(initial.id);
    expect(sort === 'desc' ? first.body.page.itemIds : first.body.itemIds).toEqual([]);

    const arrival = await createArticle(user, feed, 'First tagged arrival', new Date());
    await Tag.create({ userId: user.id, articleId: arrival.id, name: tag });
    const count = await request(app).get('/api/articles')
      .query({ ...query, newerThanArticleId: first.body.snapshot.snapshotMaxArticleId })
      .set('Authorization', authHeaderFor(user));
    expect(count.status).toBe(200);
    expect(count.body).toEqual({ newerArticleCount: 1 });
  });

  it('honors expression grouping with event filters without saving folder presentation', async () => {
    const { user, feed } = await createUserFeed('folder-expression');
    await Setting.create({ userId: user.id, sort: 'recommended', grouping: 'event' });
    const representative = await createArticle(user, feed, 'Representative', new Date());
    const event = await Event.create({ userId: user.id, representativeArticleId: representative.id });
    await representative.update({ eventId: event.id });
    await createArticle(user, feed, 'Other event member', new Date(), { eventId: event.id });
    const response = await request(app).get('/api/articles').query({
      feedId: feed.id, search: 'event:true sort:asc grouping:event', sort: 'desc', grouping: 'none', persistSettings: false
    }).set('Authorization', authHeaderFor(user));
    expect(response.status).toBe(200);
    expect(response.body.itemIds).toEqual([representative.id]);
    expect(await Setting.findOne({ where: { userId: user.id }, raw: true }))
      .toMatchObject({ sort: 'recommended', grouping: 'event' });
  });

  it('counts arrivals only inside the current query limit', async () => {
    const { user, feed } = await createUserFeed('limited-arrivals');
    const initial = await createArticle(user, feed, 'First', new Date('2026-08-10T12:00:00Z'));
    await createArticle(user, feed, 'Backdated arrival', new Date('2026-08-09T12:00:00Z'));
    const query = { feedId: feed.id, search: 'sort:desc limit:1', newerThanArticleId: initial.id };
    const count = () => request(app).get('/api/articles').query(query).set('Authorization', authHeaderFor(user));
    expect((await count()).body).toEqual({ newerArticleCount: 0 });
    await createArticle(user, feed, 'Newest arrival', new Date('2026-08-11T12:00:00Z'));
    expect((await count()).body).toEqual({ newerArticleCount: 1 });
  });
});
