import { decryptSecret, isEncryptedSecret } from '../../services/secretEncryption.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { getEmailConfiguration, isEmailEnabled } from '../../services/email/configuration.js';

let app;
let admin;
let user;
const authorization = person => `Bearer ${jwt.sign({ userId: person.id }, getJwtSecret())}`;
const endpoint = (method, person = admin) => request(app)[method]('/api/setting/server/smtp').set('Authorization', authorization(person));
const environment = {
  EMAIL_ENABLED: 'true', PUBLIC_APP_URL: 'https://reader.example.com', SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'true', SMTP_USER: 'reader',
  SMTP_PASSWORD: 'environment-test-secret', SMTP_PASSWORD_FILE: '', EMAIL_FROM: 'Reader <reader@example.com>', EMAIL_REPLY_TO: ''
};
const fullOverrides = (changes = {}) => ({
  EMAIL_ENABLED: true, PUBLIC_APP_URL: environment.PUBLIC_APP_URL, SMTP_HOST: environment.SMTP_HOST,
  SMTP_PORT: 587, SMTP_SECURE: false, SMTP_REQUIRE_TLS: true, SMTP_USER: environment.SMTP_USER,
  EMAIL_FROM: environment.EMAIL_FROM, EMAIL_REPLY_TO: '', ...changes
});
beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true';
  app = (await import('../../app.js')).default;
  const create = role => db.User.create({ username: `smtp-settings-${role}`, password: 'test-hash', feverCredentialHash: `smtp-settings-${role}`, role });
  admin = await create('admin'); user = await create('user');
});
beforeEach(async () => {
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  await db.ServerSetting.destroy({ where: { key: 'emailConfiguration' } });
});
afterEach(async () => {
  await db.ServerSetting.destroy({ where: { key: 'emailConfiguration' } });
  vi.unstubAllEnvs();
});

describe('SMTP settings API', () => {
  it.each(['get', 'put', 'delete'])('requires authentication and current admin role for %s', async method => {
    expect((await request(app)[method]('/api/setting/server/smtp')).status).toBe(400);
    expect((await endpoint(method, user).send({ overrides: {}, passwordAction: 'keep' })).status).toBe(403);
    const token = authorization(admin);
    await admin.update({ role: 'user' });
    try {
      expect((await request(app)[method]('/api/setting/server/smtp').set('Authorization', token)).status).toBe(403);
    } finally { await admin.update({ role: 'admin' }); }
  });
  it('reports defaults, stores encrypted overrides without exposing passwords, and restores defaults', async () => {
    const original = await endpoint('get');
    expect(original.body).toMatchObject({ configured: true, enabled: true, password: { configured: true, overridden: false } });
    expect(JSON.stringify(original.body)).not.toContain(environment.SMTP_PASSWORD);
    const saved = await endpoint('put').send({ overrides: fullOverrides({ SMTP_HOST: 'override.example.com', PUBLIC_APP_URL: 'https://override.example.com' }), passwordAction: 'replace', password: 'database-test-secret' });
    expect(saved.status).toBe(200);
    expect(saved.body.fields.SMTP_HOST).toEqual({ value: 'override.example.com', overridden: true });
    expect(saved.body.password).toEqual({ configured: true, overridden: true });
    expect(JSON.stringify(saved.body)).not.toContain('database-test-secret');
    expect(decryptSecret((await db.ServerSetting.findByPk('emailConfiguration')).value.SMTP_PASSWORD)).toBe('database-test-secret');
    const effective = await getEmailConfiguration();
    expect(effective.smtp.host).toBe('override.example.com');
    expect(effective.smtp.auth.pass).toBe('database-test-secret');
    expect(effective.publicAppUrl).toBe('https://override.example.com');
    expect(JSON.stringify(effective)).not.toContain('database-test-secret');
    await endpoint('put').send({ overrides: fullOverrides({ EMAIL_ENABLED: false }), passwordAction: 'keep' });
    expect(await isEmailEnabled()).toBe(false);
    expect((await request(app).get('/api/auth/configuration')).body.emailEnabled).toBe(false);
    expect(decryptSecret((await db.ServerSetting.findByPk('emailConfiguration')).value.SMTP_PASSWORD)).toBe('database-test-secret');
    await db.ServerSetting.upsert({ key: 'allowRegistration', value: false });
    try {
      const cleared = await endpoint('delete');
      expect(cleared.body.password.overridden).toBe(false);
      expect((await getEmailConfiguration()).smtp.auth.pass).toBe(environment.SMTP_PASSWORD);
      expect((await db.ServerSetting.findByPk('allowRegistration')).value).toBe(false);
    } finally { await db.ServerSetting.destroy({ where: { key: 'allowRegistration' } }); }
  });
  it('supports clearing credentials and using the environment password again', async () => {
    const cleared = await endpoint('put').send({ overrides: fullOverrides({ SMTP_USER: '' }), passwordAction: 'clear' });
    expect(cleared.status).toBe(200);
    expect((await getEmailConfiguration()).smtp.auth).toBeNull();
    const restored = await endpoint('put').send({ overrides: {}, passwordAction: 'environment' });
    expect(restored.status).toBe(200);
    expect((await getEmailConfiguration()).smtp.auth.pass).toBe(environment.SMTP_PASSWORD);
  });
  it('ignores environment password files while overridden and restores them afterwards', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'rssmonster-smtp-test-'));
    const filename = path.join(directory, 'password');
    try {
      await writeFile(filename, 'file-test-secret\n');
      vi.stubEnv('SMTP_PASSWORD', '');
      vi.stubEnv('SMTP_PASSWORD_FILE', filename);
      expect((await getEmailConfiguration()).smtp.auth.pass).toBe('file-test-secret');
      const saved = await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'replace', password: 'override-secret' });
      expect(saved.status).toBe(200);
      expect((await getEmailConfiguration()).smtp.auth.pass).toBe('override-secret');
      expect(saved.body.fields).not.toHaveProperty('SMTP_PASSWORD_FILE');
      expect(JSON.stringify(saved.body)).not.toContain('override-secret');
      await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'keep' });
      expect((await getEmailConfiguration()).smtp.auth.pass).toBe('override-secret');
      const cleared = await endpoint('put').send({ overrides: fullOverrides({ SMTP_USER: '' }), passwordAction: 'clear' });
      expect(cleared.status).toBe(200);
      expect((await getEmailConfiguration()).smtp.auth).toBeNull();
      await endpoint('put').send({ overrides: {}, passwordAction: 'environment' });
      expect((await getEmailConfiguration()).smtp.auth.pass).toBe('file-test-secret');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('does not inherit environment credentials when enabling the override', async () => {
    const saved = await endpoint('put').send({ overrides: fullOverrides({ SMTP_USER: '' }), passwordAction: 'keep' });
    expect(saved.status).toBe(200);
    expect((await getEmailConfiguration()).smtp.auth).toBeNull();
    expect(saved.body.password).toEqual({ configured: false, overridden: true });
  });
  it('ignores a previously saved password file in managed configuration', async () => {
    await db.ServerSetting.upsert({ key: 'emailConfiguration', value: { ...fullOverrides(), SMTP_PASSWORD: 'saved-secret', SMTP_PASSWORD_FILE: '/missing' } });
    expect((await getEmailConfiguration()).smtp.auth.pass).toBe('saved-secret');
  });
  it.each([
    { overrides: fullOverrides(), passwordAction: 'environment' },
    { overrides: fullOverrides({ UNKNOWN: 'value' }), passwordAction: 'keep' },
    { overrides: fullOverrides({ EMAIL_ENABLED: 'true' }), passwordAction: 'keep' },
    { overrides: fullOverrides({ SMTP_PORT: 0 }), passwordAction: 'keep' },
    { overrides: fullOverrides({ SMTP_SECURE: true }), passwordAction: 'keep' },
    { overrides: fullOverrides({ SMTP_REQUIRE_TLS: true, SMTP_PORT: 465, SMTP_SECURE: true }), passwordAction: 'keep' },
    { overrides: fullOverrides({ PUBLIC_APP_URL: 'javascript:invalid' }), passwordAction: 'keep' },
    { overrides: fullOverrides({ EMAIL_FROM: 'Invalid sender' }), passwordAction: 'keep' },
    { overrides: fullOverrides({ SMTP_PASSWORD_FILE: '/missing' }), passwordAction: 'keep' },
    { overrides: {}, passwordAction: 'keep', password: 'not-allowed' },
    { overrides: {}, passwordAction: 'replace', password: '' },
    { overrides: fullOverrides({ SMTP_HOST: 'host\nInjected' }), passwordAction: 'keep' }
  ])('rejects invalid changes atomically: %j', async input => {
    expect((await endpoint('put').send(input)).status).toBe(400);
    expect((await getEmailConfiguration()).smtp.host).toBe('smtp.example.com');
    expect(await db.ServerSetting.findByPk('emailConfiguration')).toBeNull();
  });
  it('can disable an incomplete deployment and later enable a complete database configuration', async () => {
    for (const key of Object.keys(environment)) vi.stubEnv(key, '');
    expect((await endpoint('put').send({ overrides: fullOverrides({ EMAIL_ENABLED: false, SMTP_USER: '' }), passwordAction: 'keep' })).status).toBe(200);
    const overrides = { EMAIL_ENABLED: true, SMTP_HOST: 'smtp.example.com', SMTP_PORT: 587, SMTP_SECURE: false, SMTP_REQUIRE_TLS: true, PUBLIC_APP_URL: 'https://reader.example.com', EMAIL_FROM: 'reader@example.com' };
    expect((await endpoint('put').send({ overrides: fullOverrides({ ...overrides, SMTP_USER: '' }), passwordAction: 'keep' })).status).toBe(200);
    expect(await isEmailEnabled()).toBe(true);
  });
});

it('removes the whole group including the saved password when EMAIL_ENABLED is inherited', async () => {
  await endpoint('put').send({ overrides: fullOverrides({ SMTP_HOST: 'saved.example.com' }), passwordAction: 'replace', password: 'saved-test-secret' });
  const response = await endpoint('put').send({ overrides: {}, passwordAction: 'keep' });
  expect(response.status).toBe(200);
  expect(response.body.fields.EMAIL_ENABLED.overridden).toBe(false);
  expect(response.body.fields.SMTP_HOST.overridden).toBe(false);
  expect((await getEmailConfiguration()).smtp.auth.pass).toBe(environment.SMTP_PASSWORD);
  expect((await getEmailConfiguration()).smtp.host).toBe(environment.SMTP_HOST);
});
it('rejects partial SMTP groups', async () => {
  for (const overrides of [{ SMTP_HOST: 'partial.example.com' }, { EMAIL_ENABLED: true }]) {
    expect((await endpoint('put').send({ overrides, passwordAction: 'keep' })).status).toBe(400);
  }
});
it('keeps previous individual overrides visible as a managed group', async () => {
  await db.ServerSetting.upsert({ key: 'emailConfiguration', value: { SMTP_HOST: 'legacy.example.com' } });
  const response = await endpoint('get');
  expect(response.body.fields.EMAIL_ENABLED).toEqual({ value: true, overridden: true });
  expect(response.body.fields.SMTP_HOST.value).toBe('legacy.example.com');
});

it('encrypts SMTP passwords and returns only metadata on reads and saves', async () => {
  const saved = await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'replace', password: 'private-smtp' });
  expect(saved.status).toBe(200);
  const row = (await db.ServerSetting.findByPk('emailConfiguration')).value;
  expect(isEncryptedSecret(row.SMTP_PASSWORD)).toBe(true);
  expect(row.SMTP_HOST).toBe(environment.SMTP_HOST);
  expect((await getEmailConfiguration()).smtp.auth.pass).toBe('private-smtp');
  for (const response of [saved, await endpoint('get')]) {
    expect(response.body.password).toEqual({ configured: true, overridden: true });
    expect(JSON.stringify(response.body)).not.toContain('private-smtp');
    expect(JSON.stringify(response.body)).not.toContain('enc:');
    for (const segment of row.SMTP_PASSWORD.split(':').slice(2)) expect(JSON.stringify(response.body)).not.toContain(segment);
  }
});
it('reads legacy SMTP plaintext without a key and encrypts it on the next save', async () => {
  await db.ServerSetting.upsert({ key: 'emailConfiguration', value: { ...fullOverrides(), SMTP_PASSWORD: 'legacy-password' } });
  vi.stubEnv('ENCRYPTION_KEY', '');
  expect((await getEmailConfiguration()).smtp.auth.pass).toBe('legacy-password');
  expect((await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'keep' })).status).toBe(503);
  expect((await db.ServerSetting.findByPk('emailConfiguration')).value.SMTP_PASSWORD).toBe('legacy-password');
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  expect((await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'keep' })).status).toBe(200);
  expect(isEncryptedSecret((await db.ServerSetting.findByPk('emailConfiguration')).value.SMTP_PASSWORD)).toBe(true);
});
it('reports missing keys clearly at save/runtime while metadata and environment recovery remain available', async () => {
  await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'replace', password: 'private-smtp' });
  vi.stubEnv('ENCRYPTION_KEY', '');
  expect((await endpoint('get')).status).toBe(200);
  await expect(getEmailConfiguration()).rejects.toThrow(/ENCRYPTION_KEY/);
  const failed = await endpoint('put').send({ overrides: fullOverrides(), passwordAction: 'replace', password: 'replacement' });
  expect(failed.status).toBe(503);
  expect(failed.body.error).toContain('ENCRYPTION_KEY');
  expect((await endpoint('delete')).status).toBe(200);
  expect((await getEmailConfiguration()).smtp.auth.pass).toBe(environment.SMTP_PASSWORD);
});
it('does not decrypt disabled SMTP credentials', async () => {
  await endpoint('put').send({ overrides: fullOverrides({ EMAIL_ENABLED: false }), passwordAction: 'replace', password: 'private-smtp' });
  vi.stubEnv('ENCRYPTION_KEY', '');
  expect(await getEmailConfiguration()).toEqual({ enabled: false });
});
