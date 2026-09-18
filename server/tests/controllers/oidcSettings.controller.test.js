import { createOidcService } from '../../services/auth/oidc.js';
import { decryptSecret, isEncryptedSecret } from '../../services/secretEncryption.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { getAuthConfiguration } from '../../services/auth/configuration.js';

let app;
let admin;
let user;
const environment = {
  OIDC_ENABLED: 'false', LOCAL_AUTH_ENABLED: 'true', OIDC_AUTO_PROVISION: 'false',
  OIDC_ISSUER_URL: 'https://issuer.example.com', OIDC_CLIENT_ID: 'environment-client',
  OIDC_CLIENT_SECRET: 'environment-test-secret', OIDC_REDIRECT_URI: 'https://reader.example.com/api/auth/oidc/callback',
  OIDC_FRONTEND_URL: 'https://reader.example.com', OIDC_SCOPES: 'openid profile email', EMAIL_ENABLED: 'false'
};
const authorization = person => `Bearer ${jwt.sign({ userId: person.id }, getJwtSecret())}`;
const endpoint = (method, person = admin) => request(app)[method]('/api/setting/server/oidc').set('Authorization', authorization(person));
const input = () => ({
  overrides: { OIDC_ENABLED: true, LOCAL_AUTH_ENABLED: false, OIDC_AUTO_PROVISION: true,
    OIDC_ISSUER_URL: environment.OIDC_ISSUER_URL, OIDC_CLIENT_ID: 'saved-client',
    OIDC_REDIRECT_URI: environment.OIDC_REDIRECT_URI, OIDC_FRONTEND_URL: environment.OIDC_FRONTEND_URL,
    OIDC_SCOPES: 'openid email' }, secretAction: 'keep'
});
beforeAll(async () => {
  app = (await import('../../app.js')).default;
  admin = await db.User.create({ username: 'oidc-settings-admin', password: 'test-hash', role: 'admin' });
  user = await db.User.create({ username: 'oidc-settings-user', password: 'test-hash' });
});
beforeEach(async () => {
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  await db.ServerSetting.destroy({ where: { key: 'authConfiguration' } });
});
afterEach(async () => {
  await db.ServerSetting.destroy({ where: { key: 'authConfiguration' } });
  vi.unstubAllEnvs();
});

describe('OIDC server settings', () => {
  it.each(['get', 'put', 'delete'])('requires an authenticated current administrator for %s', async method => {
    expect((await request(app)[method]('/api/setting/server/oidc')).status).toBe(400);
    expect((await endpoint(method, user)).status).toBe(403);
    await admin.update({ role: 'user' });
    try { expect((await endpoint(method)).status).toBe(403); } finally { await admin.update({ role: 'admin' }); }
  });
  it('inherits environment settings and never returns the secret', async () => {
    const result = await endpoint('get');
    expect(result.status).toBe(200);
    expect(result.body.fields.OIDC_ENABLED).toEqual({ value: false, overridden: false });
    expect(result.body.secret).toEqual({ configured: true, overridden: false });
    expect(JSON.stringify(result.body)).not.toContain(environment.OIDC_CLIENT_SECRET);
  });
  it('applies overrides immediately to discovery, local access and administrator capability responses', async () => {
    expect((await endpoint('put').send(input())).status).toBe(200);
    const config = await getAuthConfiguration();
    expect(config.localAuthEnabled).toBe(false);
    expect(config.oidc.clientId).toBe('saved-client');
    const publicConfig = await request(app).get('/api/auth/configuration');
    expect(publicConfig.body.localAuthEnabled).toBe(false);
    expect(publicConfig.body.oidcEnabled).toBe(true);
    expect((await request(app).post('/api/auth/login').send({ username: user.username, password: 'test' })).status).toBe(403);
    const users = await request(app).get('/api/users').set('Authorization', authorization(admin));
    expect(users.body.users.find(person => person.id === user.id).localPasswordEnabled).toBe(false);
    expect((await endpoint('delete')).status).toBe(200);
    expect((await getAuthConfiguration()).localAuthEnabled).toBe(true);
    expect((await getAuthConfiguration()).oidcEnabled).toBe(false);
  });
  it('uses saved local-auth policy for compatibility endpoints and account settings', async () => {
    await endpoint('put').send(input());
    const account = await request(app).get('/api/auth/account').set('Authorization', authorization(user));
    expect(account.body.localPasswordEnabled).toBe(false);
    expect((await request(app).post('/api/greader/accounts/ClientLogin').send({ Email: user.username, Passwd: 'test' })).status).toBe(401);
    const fever = await request(app).post('/api/fever?action=login').send({ username: user.username, password: 'test' });
    expect(fever.body.auth).toBe(0);
    const cors = await request(app).options('/api/auth/oidc/exchange').set('Origin', 'https://reader.example.com').set('Access-Control-Request-Method', 'POST');
    expect(cors.headers['access-control-allow-origin']).toBe('https://reader.example.com');
    const otherOrigin = await request(app).options('/api/auth/oidc/exchange').set('Origin', 'https://other.example.com').set('Access-Control-Request-Method', 'POST');
    expect(otherOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('replaces and retains the secret without echoing it, then restores the environment', async () => {
    const body = { ...input(), secretAction: 'replace', secret: 'replacement-test-secret' };
    const saved = await endpoint('put').send(body);
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain(body.secret);
    expect((await getAuthConfiguration()).oidc.clientSecret).toBe(body.secret);
    await endpoint('put').send(input());
    expect((await getAuthConfiguration()).oidc.clientSecret).toBe(body.secret);
    await endpoint('put').send({ ...input(), secretAction: 'environment' });
    expect((await getAuthConfiguration()).oidc.clientSecret).toBe(environment.OIDC_CLIENT_SECRET);
  });
  it('rejects disabling both methods and leaves saved settings intact', async () => {
    await endpoint('put').send(input());
    const body = input(); body.overrides.OIDC_ENABLED = false;
    expect((await endpoint('put').send(body)).status).toBe(400);
    expect((await getAuthConfiguration()).oidcEnabled).toBe(true);
  });
  it.each([
    body => { body.overrides.OIDC_REDIRECT_URI = 'https://reader.example.com/wrong'; },
    body => { body.overrides.OIDC_ISSUER_URL = 'http://issuer.example.com'; },
    body => { body.overrides.OIDC_FRONTEND_URL = 'https://other.example.com'; },
    body => { body.overrides.OIDC_SCOPES = 'email'; },
    body => { body.overrides.OIDC_AUTO_PROVISION = 'true'; },
    body => { body.overrides.OIDC_CLIENT_ID = ''; },
    body => { body.overrides.OIDC_CLIENT_SECRET = 'not-allowed'; }
  ])('rejects invalid provider settings', async mutate => {
    const body = input(); mutate(body);
    expect((await endpoint('put').send(body)).status).toBe(400);
  });
  it('refuses an environment restore that would disable both methods', async () => {
    await endpoint('put').send(input());
    vi.stubEnv('LOCAL_AUTH_ENABLED', 'false');
    expect((await endpoint('delete')).status).toBe(400);
    expect((await getAuthConfiguration()).oidcEnabled).toBe(true);
  });
});

it('encrypts both OIDC credentials, hides them in APIs and retains the hidden client ID', async () => {
  const body = { ...input(), secretAction: 'replace', secret: 'private-oidc' };
  const saved = await endpoint('put').send(body);
  expect(saved.status).toBe(200);
  const stored = (await db.ServerSetting.findByPk('authConfiguration')).value;
  expect(stored.OIDC_ISSUER_URL).toBe(environment.OIDC_ISSUER_URL);
  for (const key of ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET']) expect(isEncryptedSecret(stored[key])).toBe(true);
  expect(decryptSecret(stored.OIDC_CLIENT_ID)).toBe('saved-client');
  expect(decryptSecret(stored.OIDC_CLIENT_SECRET)).toBe('private-oidc');
  for (const response of [saved, await endpoint('get')]) {
    expect(response.body.fields.OIDC_CLIENT_ID).toEqual({ configured: true, overridden: true });
    const serialized = JSON.stringify(response.body);
    for (const value of ['saved-client', 'private-oidc', 'enc:', ...stored.OIDC_CLIENT_ID.split(':').slice(2), ...stored.OIDC_CLIENT_SECRET.split(':').slice(2)]) expect(serialized).not.toContain(value);
  }
  const retained = input(); delete retained.overrides.OIDC_CLIENT_ID;
  expect((await endpoint('put').send(retained)).status).toBe(200);
  expect((await getAuthConfiguration()).oidc).toMatchObject({ clientId: 'saved-client', clientSecret: 'private-oidc' });
});
it('keeps legacy OIDC installations usable and migrates retained credentials on save', async () => {
  await db.ServerSetting.upsert({ key: 'authConfiguration', value: { ...input().overrides, OIDC_CLIENT_SECRET: 'legacy-secret' } });
  vi.stubEnv('ENCRYPTION_KEY', '');
  expect((await getAuthConfiguration()).oidc).toMatchObject({ clientId: 'saved-client', clientSecret: 'legacy-secret' });
  const body = input(); delete body.overrides.OIDC_CLIENT_ID;
  const failed = await endpoint('put').send(body);
  expect(failed.status).toBe(503);
  expect(failed.body.error).toContain('ENCRYPTION_KEY');
  expect((await db.ServerSetting.findByPk('authConfiguration')).value.OIDC_CLIENT_SECRET).toBe('legacy-secret');
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  expect((await endpoint('put').send(body)).status).toBe(200);
  const stored = (await db.ServerSetting.findByPk('authConfiguration')).value;
  expect(isEncryptedSecret(stored.OIDC_CLIENT_ID)).toBe(true);
  expect(isEncryptedSecret(stored.OIDC_CLIENT_SECRET)).toBe(true);
});
it('allows metadata and environment recovery without the key, but fails encrypted runtime reads', async () => {
  await endpoint('put').send({ ...input(), secretAction: 'replace', secret: 'private-oidc' });
  vi.stubEnv('ENCRYPTION_KEY', '');
  expect((await endpoint('get')).status).toBe(200);
  await expect(getAuthConfiguration()).rejects.toThrow(/ENCRYPTION_KEY/);
  expect((await endpoint('delete')).status).toBe(200);
  vi.stubEnv('OIDC_ENABLED', 'true');
  expect((await getAuthConfiguration()).oidc).toMatchObject({ clientId: environment.OIDC_CLIENT_ID, clientSecret: environment.OIDC_CLIENT_SECRET });
  const response = await endpoint('get');
  expect(response.body.fields.OIDC_CLIENT_ID).toEqual({ configured: true, overridden: false });
  expect(JSON.stringify(response.body)).not.toContain(environment.OIDC_CLIENT_ID);
  expect(JSON.stringify(response.body)).not.toContain(environment.OIDC_CLIENT_SECRET);
});
it('does not decrypt credentials for disabled OIDC', async () => {
  const body = input(); body.overrides.OIDC_ENABLED = false; body.overrides.LOCAL_AUTH_ENABLED = true;
  expect((await endpoint('put').send({ ...body, secretAction: 'replace', secret: 'private-oidc' })).status).toBe(200);
  vi.stubEnv('ENCRYPTION_KEY', '');
  expect((await getAuthConfiguration()).oidc).toBeNull();
});

it('passes decrypted credentials to OIDC discovery', async () => {
  await endpoint('put').send({ ...input(), secretAction: 'replace', secret: 'discovery-secret' });
  const discovery = vi.fn().mockRejectedValue(new Error('discovery stopped for test'));
  const service = createOidcService({ protocol: { discovery } });
  await expect(service.start((await getAuthConfiguration()).oidc)).rejects.toThrow('discovery stopped for test');
  expect(discovery).toHaveBeenCalledWith(new URL(environment.OIDC_ISSUER_URL), 'saved-client', 'discovery-secret', undefined, expect.any(Object));
});
it('can replace encrypted values with a new key without decrypting discarded credentials', async () => {
  await endpoint('put').send({ ...input(), secretAction: 'replace', secret: 'original-secret' });
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
  expect((await endpoint('put').send({ ...input(), secretAction: 'replace', secret: 'replacement-secret' })).status).toBe(200);
  expect((await getAuthConfiguration()).oidc.clientSecret).toBe('replacement-secret');
});
