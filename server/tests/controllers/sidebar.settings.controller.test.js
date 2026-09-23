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
const defaults = { showTotalCount: true, declutterCounts: true };

describe('Sidebar settings API', () => {
  beforeAll(async () => { app = (await import('../../app.js')).default; });

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
    await db.SidebarSetting.create({ userId: other.id });
    for (const settings of [
      { showTotalCount: false, declutterCounts: true },
      { showTotalCount: true, declutterCounts: false }
    ]) {
      const response = await request(app).put('/api/sidebar/settings')
        .set('Authorization', authorization(user)).send({ settings: { ...settings, userId: other.id } });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ settings });
      const restored = await request(app).get('/api/sidebar/settings').set('Authorization', authorization(user));
      expect(restored.body.settings).toEqual(settings);
      const startup = await request(app).get('/api/setting').set('Authorization', authorization(user));
      expect(startup.status).toBe(200);
      expect(startup.body.sidebarSettings).toEqual(settings);
    }
    expect(await db.SidebarSetting.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.SidebarSetting.findOne({ where: { userId: other.id } })).toMatchObject(defaults);
  });

  it.each([null, [], {}, { showTotalCount: 'false', declutterCounts: true },
    { showTotalCount: true, declutterCounts: 0 }])('rejects invalid settings %j without writing', async settings => {
    const user = await createUser();
    const response = await request(app).put('/api/sidebar/settings')
      .set('Authorization', authorization(user)).send({ settings });
    expect(response.status).toBe(400);
    expect(await db.SidebarSetting.count({ where: { userId: user.id } })).toBe(0);
  });

  it.each(['get', 'put'])('requires authentication for %s', async method => {
    const response = await request(app)[method]('/api/sidebar/settings').send({ settings: defaults });
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('message');
  });
});
