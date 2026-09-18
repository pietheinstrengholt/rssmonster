import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

let app;
let admin;
let user;
const authorization = person => `Bearer ${jwt.sign({ userId: person.id }, getJwtSecret())}`;
const settings = (method, person = admin) => request(app)[method]('/api/setting/server').set('Authorization', authorization(person));
beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true';
  app = (await import('../../app.js')).default;
  const create = role => db.User.create({ username: `server-settings-${role}`, password: 'test-hash', feverCredentialHash: `server-settings-${role}`, role });
  admin = await create('admin');
  user = await create('user');
});
beforeEach(async () => {
  vi.stubEnv('LOCAL_AUTH_ENABLED', 'true');
  vi.stubEnv('ALLOW_REGISTRATION', 'true');
  await db.ServerSetting.destroy({ where: {} });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.ServerSetting.destroy({ where: {} });
  vi.unstubAllEnvs();
});

describe('server settings', () => {
  it.each(['get', 'put'])('requires a current administrator for %s', async method => {
    expect((await request(app)[method]('/api/setting/server')).status).toBe(400);
    expect((await settings(method, user).send({ allowRegistration: false })).status).toBe(403);
    const token = authorization(admin);
    await admin.update({ role: 'user' });
    try {
      expect((await request(app)[method]('/api/setting/server').set('Authorization', token).send({ allowRegistration: false })).status).toBe(403);
    } finally {
      await admin.update({ role: 'admin' });
    }
    expect(await db.ServerSetting.count()).toBe(0);
  });
  it.each([true, false])('overrides environment %s and restores it when cleared', async environmentValue => {
    vi.stubEnv('ALLOW_REGISTRATION', String(environmentValue));
    expect((await settings('get')).body.allowRegistration).toEqual({ override: null, environmentValue, effectiveValue: environmentValue });
    const saved = await settings('put').send({ allowRegistration: !environmentValue });
    expect(saved.status).toBe(200);
    expect(saved.body.allowRegistration).toEqual({ override: !environmentValue, environmentValue, effectiveValue: !environmentValue });
    expect((await settings('get')).body.allowRegistration.override).toBe(!environmentValue);
    expect((await request(app).get('/api/auth/configuration')).body.registrationEnabled).toBe(!environmentValue);
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(environmentValue ? 403 : 400);
    expect((await settings('put').send({ allowRegistration: null })).body.allowRegistration.effectiveValue).toBe(environmentValue);
    expect((await request(app).get('/api/auth/configuration')).body.registrationEnabled).toBe(environmentValue);
    expect(await db.ServerSetting.count()).toBe(0);
  });
  it('defaults to enabled when the environment is unset', async () => {
    delete process.env.ALLOW_REGISTRATION;
    expect((await settings('get')).body.allowRegistration).toMatchObject({ effectiveValue: true, override: null });
  });
  it.each([{}, { allowRegistration: 'false' }, { allowRegistration: 0 }, { allowRegistration: [] }, { allowRegistration: true, other: false }])('rejects invalid settings %j', async input => {
    expect((await settings('put').send(input)).status).toBe(400);
    expect(await db.ServerSetting.count()).toBe(0);
  });
  it('keeps registration unavailable when local authentication is disabled', async () => {
    await settings('put').send({ allowRegistration: true });
    vi.stubEnv('LOCAL_AUTH_ENABLED', 'false');
    expect((await request(app).post('/api/auth/register').send({})).status).toBe(403);
  });
  it('does not reopen registration when the settings database fails', async () => {
    vi.spyOn(db.ServerSetting, 'findByPk').mockRejectedValue(new Error('database unavailable'));
    expect((await settings('get')).status).toBe(503);
    expect((await request(app).post('/api/auth/register').send({})).status).toBeGreaterThanOrEqual(500);
    expect((await request(app).get('/api/auth/configuration')).status).toBeGreaterThanOrEqual(500);
  });
});
