import { createECDH } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { decryptSecret, isEncryptedSecret } from '../../services/secretEncryption.js';
import { getPushConfiguration } from '../../services/push/configuration.js';

const pair = () => {
  const curve = createECDH('prime256v1'); curve.generateKeys();
  return { publicKey: curve.getPublicKey().toString('base64url'), privateKey: Buffer.from(curve.getPrivateKey().toString('hex').padStart(64, '0'), 'hex').toString('base64url') };
};
const defaults = pair();
let app, admin, user;
const token = person => `Bearer ${jwt.sign({ userId: person.id }, getJwtSecret())}`;
const endpoint = (method, person = admin) => request(app)[method]('/api/setting/server/push').set('Authorization', token(person));
beforeAll(async () => {
  app = (await import('../../app.js')).default;
  admin = await db.User.create({ username: 'push-settings-admin', password: 'hash', role: 'admin' });
  user = await db.User.create({ username: 'push-settings-user', password: 'hash' });
});
beforeEach(async () => {
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('VAPID_PUBLIC_KEY', defaults.publicKey);
  vi.stubEnv('VAPID_PRIVATE_KEY', defaults.privateKey);
  vi.stubEnv('VAPID_SUBJECT', 'mailto:admin@example.com');
  await db.ServerSetting.destroy({ where: { key: 'pushConfiguration' } });
});
afterEach(async () => {
  await db.ServerSetting.destroy({ where: { key: 'pushConfiguration' } });
  vi.unstubAllEnvs();
});

describe('Web Push server settings', () => {
  it.each(['get', 'put', 'delete'])('requires current administrator access for %s', async method => {
    expect((await request(app)[method]('/api/setting/server/push')).status).toBe(400);
    expect((await endpoint(method, user)).status).toBe(403);
    await admin.update({ role: 'user' });
    try { expect((await endpoint(method)).status).toBe(403); } finally { await admin.update({ role: 'admin' }); }
  });
  it('encrypts both keys and returns only metadata through settings APIs', async () => {
    const keys = pair();
    const saved = await endpoint('put').send({ overridden: true, subject: 'mailto:owner@example.com', ...keys });
    expect(saved.status).toBe(200);
    const stored = (await db.ServerSetting.findByPk('pushConfiguration')).value;
    expect(stored.VAPID_SUBJECT).toBe('mailto:owner@example.com');
    for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) expect(isEncryptedSecret(stored[key])).toBe(true);
    expect(decryptSecret(stored.VAPID_PUBLIC_KEY)).toBe(keys.publicKey);
    expect(decryptSecret(stored.VAPID_PRIVATE_KEY)).toBe(keys.privateKey);
    for (const response of [saved, await endpoint('get')]) {
      expect(response.body).toMatchObject({ configured: true, overridden: true, fields: { VAPID_PUBLIC_KEY: { configured: true, overridden: true }, VAPID_PRIVATE_KEY: { configured: true, overridden: true } } });
      const json = JSON.stringify(response.body);
      for (const value of [keys.publicKey, keys.privateKey, 'enc:', ...stored.VAPID_PUBLIC_KEY.split(':').slice(2), ...stored.VAPID_PRIVATE_KEY.split(':').slice(2)]) expect(json).not.toContain(value);
    }
    expect(await getPushConfiguration()).toMatchObject({ enabled: true, ...keys });
    const browser = await request(app).get('/api/push/configuration').set('Authorization', token(user));
    expect(browser.body).toEqual({ enabled: true, publicKey: keys.publicKey });
    expect((await request(app).get('/api/push/configuration')).status).toBe(400);
  });
  it('retains saved keys, clears them, and restores the complete environment configuration', async () => {
    const keys = pair();
    await endpoint('put').send({ overridden: true, subject: 'mailto:owner@example.com', ...keys });
    expect((await endpoint('put').send({ overridden: true, subject: 'https://example.com/contact' })).status).toBe(200);
    expect(await getPushConfiguration()).toMatchObject({ ...keys, subject: 'https://example.com/contact' });
    expect((await endpoint('put').send({ overridden: true, subject: '', publicKey: '', privateKey: '' })).status).toBe(200);
    expect((await getPushConfiguration()).enabled).toBe(false);
    expect((await endpoint('put').send({ overridden: false })).status).toBe(200);
    expect(await getPushConfiguration()).toMatchObject({ ...defaults, enabled: true, subject: 'mailto:admin@example.com' });
    expect(await db.ServerSetting.findByPk('pushConfiguration')).toBeNull();
  });
  it('supports environment-only operation and recovery without an encryption key', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(await getPushConfiguration()).toMatchObject(defaults);
    const metadata = await endpoint('get');
    expect(JSON.stringify(metadata.body)).not.toContain(defaults.publicKey);
    expect(JSON.stringify(metadata.body)).not.toContain(defaults.privateKey);
    const failed = await endpoint('put').send({ overridden: true, subject: 'mailto:owner@example.com', ...pair() });
    expect(failed.status).toBe(503);
    expect(failed.body.error).toContain('ENCRYPTION_KEY');
    expect(await db.ServerSetting.findByPk('pushConfiguration')).toBeNull();
    vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    await endpoint('put').send({ overridden: true, subject: 'mailto:owner@example.com', ...pair() });
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect((await endpoint('get')).status).toBe(200);
    await expect(getPushConfiguration()).rejects.toThrow(/ENCRYPTION_KEY/);
    expect((await endpoint('delete')).status).toBe(200);
    expect(await getPushConfiguration()).toMatchObject(defaults);
  });
  it.each([
    { overridden: true, subject: 'javascript:invalid', ...defaults },
    { overridden: true, subject: 'mailto:admin@example.com', publicKey: 'bad', privateKey: 'bad' },
    { overridden: true, subject: 'mailto:admin@example.com', publicKey: defaults.publicKey, privateKey: pair().privateKey },
    { overridden: true, subject: '', ...defaults },
    { overridden: true, subject: 'mailto:admin@example.com', publicKey: defaults.publicKey },
    { overridden: false, privateKey: 'not-allowed' }
  ])('rejects invalid configuration atomically', async input => {
    expect((await endpoint('put').send(input)).status).toBe(400);
    expect(await db.ServerSetting.findByPk('pushConfiguration')).toBeNull();
  });
});

it('keeps Web Push optional when environment keys are missing or blank', async () => {
  vi.stubEnv('ENCRYPTION_KEY', '');
  vi.stubEnv('VAPID_PUBLIC_KEY', '   ');
  vi.stubEnv('VAPID_PRIVATE_KEY', '');
  expect(await getPushConfiguration()).toEqual({ enabled: false, publicKey: null, privateKey: null, subject: null });
  expect((await endpoint('get')).body.configured).toBe(false);
});
