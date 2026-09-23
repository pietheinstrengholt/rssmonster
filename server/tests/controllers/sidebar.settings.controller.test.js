import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

let app;
const createUser = () => db.User.create({
  username: `sidebar-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  password: 'test-password'
});
const authorization = user => `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
const sectionOrder = ['pinned', 'smart-folders', 'all-feeds', 'top-tags', 'categories'];
const defaults = { sectionOrder, showTotalCount: true, declutterCounts: true, hideZeroCountItems: false, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false };

describe('Sidebar settings API', () => {
  beforeAll(async () => { app = (await import('../../app.js')).default; }, 50_000);

  it('returns defaults without creating a row', async () => {
    const user = await createUser();
    const response = await request(app).get('/api/sidebar/settings').set('Authorization', authorization(user));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ settings: defaults });
    expect(await db.SidebarSetting.count({ where: { userId: user.id } })).toBe(0);
  });

  it('persists replacements for only the authenticated user and restores them at startup', async () => {
    const user = await createUser();
    const other = await createUser();
    await db.SidebarSetting.create({ userId: other.id, sectionOrder });
    for (const settings of [
      { showTotalCount: false, declutterCounts: true, hideZeroCountItems: false, automaticallyHideInactiveFeeds: false, inactiveFeedDays: 30, sortOrder: 'manual', showFeedFavicons: true, sortByCurrentSelection: false },
      { showTotalCount: true, declutterCounts: false, hideZeroCountItems: true, automaticallyHideInactiveFeeds: true, inactiveFeedDays: 60, sortOrder: 'name', showFeedFavicons: false, sortByCurrentSelection: true }
    ]) {
      const response = await request(app).put('/api/sidebar/settings')
        .set('Authorization', authorization(user)).send({ settings: { ...settings, userId: other.id } });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ settings: { sectionOrder, ...settings } });
      const restored = await request(app).get('/api/sidebar/settings').set('Authorization', authorization(user));
      expect(restored.body.settings).toEqual({ sectionOrder, ...settings });
      const startup = await request(app).get('/api/setting').set('Authorization', authorization(user));
      expect(startup.status).toBe(200);
      expect(startup.body.sidebarSettings).toEqual({ sectionOrder, ...settings });
    }
    expect(await db.SidebarSetting.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.SidebarSetting.findOne({ where: { userId: other.id } })).toMatchObject(defaults);
  });

  it.each([null, [], {}, { showTotalCount: 'false', declutterCounts: true },
    { showTotalCount: true, declutterCounts: 0 },
    { showTotalCount: true, declutterCounts: true },
    ...[undefined, null, 'false', 0].map(sortByCurrentSelection => ({ ...defaults, sortByCurrentSelection })),
    ...[undefined, null, 'false', 0].map(showFeedFavicons => ({ ...defaults, showFeedFavicons })),
    { ...defaults, hideZeroCountItems: 'true' },
    { ...defaults, hideZeroCountItems: null },
    { ...defaults, automaticallyHideInactiveFeeds: 'true' },
    { ...defaults, inactiveFeedDays: 0 },
    { ...defaults, inactiveFeedDays: 45 },
    { ...defaults, inactiveFeedDays: '30' },
    ...[null, 0, '', 'invalid'].map(sortOrder => ({ ...defaults, sortOrder }))])('rejects invalid settings %j without writing', async settings => {
    const user = await createUser();
    const response = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user)).send({ settings });
    expect(response.status).toBe(400);
    expect(await db.SidebarSetting.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each([30, 60, 90])('stores the %i-day inactivity threshold', async inactiveFeedDays => {
    const user = await createUser();
    const settings = { ...defaults, automaticallyHideInactiveFeeds: true, inactiveFeedDays };
    const response = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user)).send({ settings });
    expect(response.status).toBe(200);
    expect(response.body.settings).toEqual(settings);
    expect(await db.SidebarSetting.findOne({ where: { userId: user.id } })).toMatchObject(settings);
  });

  it.each(['manual', 'name', 'selectedCount', 'totalCount', 'recentlyActive'])('persists %s sorting', async sortOrder => {
    const user = await createUser();
    const settings = { ...defaults, sortOrder };
    const response = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user)).send({ settings });
    expect(response.status).toBe(200);
    const restored = await request(app).get('/api/setting').set('Authorization', authorization(user));
    expect(restored.body.sidebarSettings.sortOrder).toBe(sortOrder);
  });


  it('persists a custom order across reloads and scopes it to the authenticated user', async () => {
    const user = await createUser();
    const other = await createUser();
    const custom = ['categories', 'smart-folders', 'pinned', 'all-feeds', 'top-tags'];
    const response = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user))
      .send({ settings: { ...defaults, sectionOrder: custom, userId: other.id } });
    expect(response.status).toBe(200);
    expect(response.body.settings.sectionOrder).toEqual(custom);
    const stored = await db.SidebarSetting.findOne({ where: { userId: user.id } });
    expect((await stored.reload()).sectionOrder).toEqual(custom);
    for (const path of ['/api/sidebar/settings', '/api/setting']) {
      const restored = await request(app).get(path).set('Authorization', authorization(user));
      expect((restored.body.sidebarSettings ?? restored.body.settings).sectionOrder).toEqual(custom);
    }
    const untouched = await request(app).get('/api/sidebar/settings').set('Authorization', authorization(other));
    expect(untouched.body.settings.sectionOrder).toEqual(sectionOrder);
    expect(await db.SidebarSetting.count({ where: { userId: other.id } })).toBe(0);

    const legacy = { ...defaults };
    delete legacy.sectionOrder;
    const updated = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user)).send({ settings: legacy });
    expect(updated.status).toBe(200);
    expect(updated.body.settings.sectionOrder).toEqual(custom);
  });

  it.each([null, 'categories', {}, [], ['categories', 'categories', 'banana'],
    ['categories', 'smart-folders'], ['categories', 'smart-folders', 'all-feeds', 'banana'],
    ['categories', 'categories', 'all-feeds', 'top-tags'],
    [...sectionOrder, 'banana']])('rejects invalid section order %j without replacing the saved value', async invalid => {
    const user = await createUser();
    await db.SidebarSetting.create({ userId: user.id, sectionOrder });
    const response = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user)).send({ settings: { ...defaults, sectionOrder: invalid } });
    expect(response.status).toBe(400);
    expect((await db.SidebarSetting.findOne({ where: { userId: user.id } })).sectionOrder).toEqual(sectionOrder);
  });

  it.each([
    [null, sectionOrder], ['malformed', sectionOrder], [{ categories: true }, sectionOrder],
    [42, sectionOrder], [[], sectionOrder],
    [['categories', 'top-tags', 'all-feeds', 'smart-folders'], ['pinned', 'categories', 'top-tags', 'all-feeds', 'smart-folders']],
    [['categories', 'pinned', 'pinned', 'banana'], ['categories', 'pinned', 'smart-folders', 'all-feeds', 'top-tags']],
    [['categories', 'smart-folders'], ['pinned', 'categories', 'smart-folders', 'all-feeds', 'top-tags']],
    [['categories', 'categories', 'banana'], ['pinned', 'categories', 'smart-folders', 'all-feeds', 'top-tags']]
  ])('normalizes stored order %j in settings and startup responses', async (stored, expected) => {
    const user = await createUser();
    await db.SidebarSetting.create({ userId: user.id, sectionOrder: stored });
    for (const path of ['/api/sidebar/settings', '/api/setting']) {
      const response = await request(app).get(path).set('Authorization', authorization(user));
      expect(response.status).toBe(200);
      expect((response.body.sidebarSettings ?? response.body.settings).sectionOrder).toEqual(expected);
    }
  });

  it.each(['get', 'put'])('requires authentication for %s', async method => {
    const response = await request(app)[method]('/api/sidebar/settings').send({ settings: defaults });
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });
});
