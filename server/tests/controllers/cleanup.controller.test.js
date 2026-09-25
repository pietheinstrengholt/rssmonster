import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { articleRetentionCutoff } from '../../services/articleCleanup.js';

const { User, Category, Feed, Article, ArchivingSetting, Event } = db;
let app;
const old = new Date('2010-01-01T12:00:00Z');
const defaults = { neverDeleteUnread: true, neverDeleteFavorites: true, neverDeleteClicked: false,
  maximumAgeValue: 7, maximumAgeUnit: 'years', maximumArticlesPerFeed: null, maximumArticlesTotal: null };
const auth = user => `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
async function graph() {
  const user = await User.create({ username: `archive-${Date.now()}-${Math.random()}`, password: 'test-password' });
  const category = await Category.create({ userId: user.id, name: 'Archive tests' });
  const feed = await Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Test', url: `https://example.com/${user.id}` });
  return { user, feed };
}
const article = (owner, overrides = {}) => Article.create({
  userId: owner.user.id, feedId: owner.feed.id, title: 'Test', status: 'read',
  url: `https://example.com/${owner.user.id}/${Math.random()}`, createdAt: old, publishedAt: overrides.createdAt || old, ...overrides
});
const save = (owner, settings) => request(app).put('/api/setting/archiving').set('Authorization', auth(owner.user)).send({ ...defaults, ...settings });
const cleanup = owner => request(app).post('/api/cleanup').set('Authorization', auth(owner.user));
const remaining = async owner => (await Article.findAll({ where: { userId: owner.user.id }, attributes: ['id'], order: [['id', 'ASC']] })).map(row => row.id);

beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true';
  app = (await import('../../app.js')).default;
}, 50000);

describe('archiving settings and cleanup', () => {
  it('loads defaults, saves without deleting, and isolates settings by authenticated user', async () => {
    const owner = await graph();
    const other = await graph();
    const item = await article(owner);
    const response = await request(app).get('/api/setting/archiving').set('Authorization', auth(owner.user));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(defaults);
    const values = { neverDeleteUnread: false, neverDeleteClicked: true, maximumAgeValue: 2, maximumAgeUnit: 'months', maximumArticlesPerFeed: 1000000, maximumArticlesTotal: 1000000000 };
    expect((await save(owner, values)).body).toEqual({ ...defaults, ...values });
    expect(await remaining(owner)).toEqual([item.id]);
    expect((await request(app).get('/api/setting/archiving').set('Authorization', auth(other.user))).body).toEqual(defaults);
    expect(await ArchivingSetting.count({ where: { userId: owner.user.id } })).toBe(1);
  });

  it.each([
    { neverDeleteUnread: 'false' }, { maximumAgeValue: 0 }, { maximumAgeValue: 1.5 },
    { maximumAgeUnit: 'hours' }, { maximumArticlesPerFeed: 1000001 },
    { maximumArticlesTotal: 1000000001 }, { maximumArticlesTotal: -1 }, { userId: 1 }
  ])('rejects invalid settings %j without saving', async invalid => {
    const owner = await graph();
    expect((await save(owner, invalid)).status).toBe(400);
    expect(await ArchivingSetting.count({ where: { userId: owner.user.id } })).toBe(0);
  });

  it('requires authentication for settings and cleanup', async () => {
    for (const [method, path] of [['get', '/api/setting/archiving'], ['put', '/api/setting/archiving'], ['post', '/api/cleanup']]) {
      expect((await request(app)[method](path)).status).toBe(400);
      const legacyToken = jwt.sign({ username: 'missing-user' }, getJwtSecret());
      expect((await request(app)[method](path).set('Authorization', `Bearer ${legacyToken}`)).status).toBe(401);
    }
  });

  it('protects unread, favorites, recorded clicks and newer articles while isolating users', async () => {
    const owner = await graph();
    const other = await graph();
    await article(owner);
    const kept = [];
    for (const values of [{ status: 'unread' }, { favoriteInd: 1 }, { clickedAmount: 1 }, { lastClickedAt: old }, { createdAt: new Date() }]) {
      kept.push((await article(owner, values)).id);
    }
    const foreign = await article(other);
    await save(owner, { neverDeleteClicked: true });
    expect((await cleanup(owner)).body.deletedCount).toBe(1);
    expect(await remaining(owner)).toEqual(kept);
    expect(await Article.findByPk(foreign.id)).not.toBeNull();
    await save(owner, { neverDeleteUnread: false, neverDeleteFavorites: false });
    expect((await cleanup(owner)).body.deletedCount).toBe(4);
    expect(await remaining(owner)).toEqual([kept.at(-1)]);
  });

  it('keeps articles younger than seven years when no settings row exists', async () => {
    const owner = await graph();
    await article(owner);
    const unread = await article(owner, { status: 'unread' });
    const recent = await article(owner, { createdAt: new Date(Date.now() - 30 * 86400000) });
    expect((await cleanup(owner)).body.deletedCount).toBe(1);
    expect(await remaining(owner)).toEqual([unread.id, recent.id]);
  });

  it('uses publication age even for recent inserts and preserves recently published articles', async () => {
    const owner = await graph();
    await article(owner, { createdAt: new Date(), publishedAt: old });
    const recentPublication = await article(owner, { publishedAt: new Date() });
    const protectedUnread = await article(owner, { createdAt: new Date(), publishedAt: old, status: 'unread' });
    await save(owner, { neverDeleteClicked: true });
    expect((await cleanup(owner)).body.deletedCount).toBe(1);
    expect(await remaining(owner)).toEqual([recentPublication.id, protectedUnread.id]);
  });

  it('deletes oldest first only above a per-feed limit', async () => {
    const owner = await graph();
    const secondFeed = await Feed.create({ userId: owner.user.id, categoryId: owner.feed.categoryId, feedName: 'Second', url: 'https://example.com/second' });
    const oldest = await article(owner);
    const middle = await article(owner, { createdAt: new Date('2021-01-01') });
    const latest = await article(owner, { createdAt: new Date('2022-01-01') });
    const otherFeed = await article(owner, { feedId: secondFeed.id });
    await save(owner, { maximumArticlesPerFeed: 2 });
    expect((await cleanup(owner)).body.deletedCount).toBe(1);
    expect(await Article.findByPk(oldest.id)).toBeNull();
    expect(await remaining(owner)).toEqual([middle.id, latest.id, otherFeed.id]);
    expect((await cleanup(owner)).body.deletedCount).toBe(0);
  });

  it('combines feed and total caps while protecting favorites but allowing newer articles to be removed', async () => {
    const owner = await graph();
    const secondFeed = await Feed.create({ userId: owner.user.id, categoryId: owner.feed.categoryId, feedName: 'Second', url: 'https://example.com/second-combined' });
    await article(owner);
    await article(owner, { feedId: secondFeed.id });
    const protectedArticle = await article(owner, { favoriteInd: 1 });
    await article(owner, { createdAt: new Date() });
    await save(owner, { maximumArticlesPerFeed: 1, maximumArticlesTotal: 1 });
    expect((await cleanup(owner)).body.deletedCount).toBe(3);
    expect(await remaining(owner)).toEqual([protectedArticle.id]);
  });

  it('keeps old articles when the total cap is not exceeded', async () => {
    const owner = await graph();
    const kept = await article(owner);
    await save(owner, { maximumArticlesTotal: 1 });
    expect((await cleanup(owner)).body.deletedCount).toBe(0);
    expect(await remaining(owner)).toEqual([kept.id]);
  });

  it('reduces recent articles to 1000 with protections off and returns refreshed sidebar counts', async () => {
    const owner = await graph();
    const other = await graph();
    const foreign = await article(other);
    const recent = new Date(Date.now() - 3600000);
    const items = await Article.bulkCreate(Array.from({ length: 1503 }, (_, i) => ({
      userId: owner.user.id, feedId: owner.feed.id, title: `Recent ${i}`,
      url: `https://example.com/recent/${owner.user.id}/${i}`,
      status: i % 2 ? 'unread' : 'read', favoriteInd: 1, clickedAmount: 1,
      lastClickedAt: recent, createdAt: recent
    })));
    const saved = await save(owner, { maximumArticlesTotal: 1000,
      neverDeleteUnread: false, neverDeleteFavorites: false, neverDeleteClicked: false });
    expect(saved.status).toBe(200);
    const response = await cleanup(owner);
    expect(response.status).toBe(200);
    expect(response.body.deletedCount).toBe(503);
    expect(await remaining(owner)).toEqual(items.slice(-1000).map(item => item.id));
    expect(await Article.findByPk(foreign.id)).not.toBeNull();
    const overview = await request(app).post('/api/manager/overview-counts')
      .set('Authorization', auth(owner.user)).send({ grouping: 'none', includeDevelopingEvents: false });
    expect(overview.status).toBe(200);
    expect(overview.body.total).toBe(1000);
    expect((await cleanup(owner)).body.deletedCount).toBe(0);
  });

  it('enforces a per-feed cap on newer articles even with an extremely long age setting', async () => {
    const owner = await graph();
    await article(owner, { createdAt: new Date(Date.now() - 1000) });
    const newest = await article(owner, { createdAt: new Date() });
    await save(owner, { maximumArticlesPerFeed: 1, maximumAgeValue: 2147483647, maximumAgeUnit: 'years' });
    expect((await cleanup(owner)).body.deletedCount).toBe(1);
    expect(await remaining(owner)).toEqual([newest.id]);
  });

  it('scans multiple batches with equal timestamps without skipping articles', async () => {
    const owner = await graph();
    await Article.bulkCreate(Array.from({ length: 503 }, (_, i) => ({ userId: owner.user.id, feedId: owner.feed.id,
      title: `Batch ${i}`, url: `https://example.com/batch/${owner.user.id}/${i}`, status: 'read', createdAt: old })));
    await save(owner, { maximumArticlesTotal: 1 });
    expect((await cleanup(owner)).body.deletedCount).toBe(502);
    expect(await remaining(owner)).toHaveLength(1);
  });

  it('rolls back reconciliation when article deletion fails and returns a safe error', async () => {
    const owner = await graph();
    const representative = await article(owner);
    const event = await Event.create({ userId: owner.user.id, representativeArticleId: representative.id, name: 'Rollback Event' });
    await representative.update({ eventId: event.id });
    const destroy = vi.spyOn(Article, 'destroy').mockRejectedValueOnce(new Error('private database detail'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await cleanup(owner);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Could not clean up articles' });
      expect(await remaining(owner)).toEqual([representative.id]);
      expect(await Event.findByPk(event.id)).not.toBeNull();
    } finally {
      destroy.mockRestore();
      log.mockRestore();
    }
  });

  it('reconciles an Event before deleting its representative', async () => {
    const owner = await graph();
    const representative = await article(owner);
    const first = await article(owner, { status: 'unread' });
    const second = await article(owner, { status: 'unread' });
    const event = await Event.create({ userId: owner.user.id, representativeArticleId: representative.id, name: 'Retained Event' });
    await Article.update({ eventId: event.id }, { where: { userId: owner.user.id } });
    expect((await cleanup(owner)).body.deletedCount).toBe(1);
    expect(await remaining(owner)).toEqual([first.id, second.id]);
    expect(await event.reload()).toMatchObject({ representativeArticleId: first.id, articleCount: 2 });
  });
});

describe('retention cutoff', () => {
  it.each([
    [1, 'days', '2024-03-30T12:00:00.000Z'], [1, 'weeks', '2024-03-24T12:00:00.000Z'],
    [1, 'months', '2024-02-29T12:00:00.000Z'], [1, 'years', '2023-03-31T12:00:00.000Z']
  ])('subtracts %s %s', (value, unit, expected) => {
    expect(articleRetentionCutoff(value, unit, new Date('2024-03-31T12:00:00Z')).toISOString()).toBe(expected);
  });
  it('clamps leap day and treats extremely long retention as keeping everything', () => {
    expect(articleRetentionCutoff(1, 'years', new Date('2024-02-29T12:00:00Z')).toISOString()).toBe('2023-02-28T12:00:00.000Z');
    expect(articleRetentionCutoff(2147483647, 'years')).toBeNull();
  });
});
