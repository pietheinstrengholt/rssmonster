import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { confirmPasswordReset, requestPasswordReset } from '../../services/email/passwordReset.js';
import { resolveOidcIdentity } from '../../services/auth/identities.js';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { createAuthenticatedSession } from '../../services/auth/session.js';
import { createFeverApiKey, createFeverCredentialHash, createGreaderAuthToken } from '../../utils/apiCredentials.js';

let app, user, token;
const ids = [];

beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true';
  app = (await import('../../app.js')).default;
});

beforeEach(async () => {
  vi.stubEnv('EMAIL_ENABLED', 'false');
  user = await db.User.create({ username: `passwordless-${randomBytes(8).toString('hex')}`, password: null, feverCredentialHash: null });
  ids.push(user.id);
  token = (await createAuthenticatedSession(user)).token;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await db.BriefingPreference.destroy({ where: { userId: ids } });
  await db.User.destroy({ where: { id: ids.splice(0) } });
});

describe('OIDC-only account credentials', () => {
  it('rejects local login, legacy password login and password-derived API tokens', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: user.username, password: 'null' })).status).toBe(401);
    expect((await request(app).post('/api/greader/accounts/ClientLogin').send({ Email: user.username, Passwd: 'null' })).status).toBe(401);
    const fever = await request(app).post('/api/fever?action=login').send({ username: user.username, password: 'null' });
    expect(fever.status).toBe(200);
    expect(fever.body.auth).toBe(0);
    expect(fever.headers['set-cookie']).toBeUndefined();
    const reader = await request(app).get('/api/greader/reader/api/0/user-info')
      .set('Authorization', `GoogleLogin auth=${user.username}/${createGreaderAuthToken(user)}`);
    expect(reader.status).toBe(401);
  });

  it('allows account settings but rejects creating a local password', async () => {
    const account = await request(app).get('/api/auth/account').set('Authorization', `Bearer ${token}`);
    expect(account.status).toBe(200);
    expect(account.body.localPasswordEnabled).toBe(false);
    expect(account.body.emailManagedByProvider).toBe(true);
    expect((await request(app).patch('/api/auth/email').set('Authorization', `Bearer ${token}`).send({ email: 'new@example.com' })).status).toBe(403);
    expect(account.body).not.toHaveProperty('password');
    const values = { email: null, emailDigestEnabled: false, emailDigestTime: '08:00', emailDigestTimezone: 'UTC', emailDigestSkipWhenEmpty: true };
    const saved = await request(app).patch('/api/auth/account').set('Authorization', `Bearer ${token}`).send(values);
    expect(saved.status).toBe(200);
    const emailChange = await request(app).patch('/api/auth/account').set('Authorization', `Bearer ${token}`).send({ ...values, email: 'new@example.com' });
    expect(emailChange.status).toBe(403);
    expect(emailChange.body.code).toBe('EMAIL_MANAGED_BY_PROVIDER');
    const changed = await request(app).patch('/api/auth/account').set('Authorization', `Bearer ${token}`)
      .send({ ...values, password: 'new-password', passwordRepeat: 'new-password' });
    expect(changed.status).toBe(403);
    expect((await user.reload()).password).toBeNull();
  });

  it('reports credential capabilities to administrators and rejects password assignment', async () => {
    const admin = await db.User.create({ username: `admin-${randomBytes(8).toString('hex')}`, password: 'hash', feverCredentialHash: randomBytes(32).toString('hex'), role: 'admin' });
    ids.push(admin.id);
    const adminToken = (await createAuthenticatedSession(admin)).token;
    const details = await request(app).get(`/api/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(details.body.user.localPasswordEnabled).toBe(false);
    const changed = await request(app).post(`/api/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`)
      .send({ username: user.username, role: 'user', password: 'replacement-password' });
    expect(changed.status).toBe(403);
    expect((await user.reload()).password).toBeNull();
  });
});


describe('globally disabled local authentication', () => {
  beforeEach(async () => {
    await user.update({
      password: await bcrypt.hash('existing-password', 10),
      feverCredentialHash: createFeverCredentialHash(createFeverApiKey(user.username, 'existing-password')),
      role: 'admin'
    });
    vi.stubEnv('LOCAL_AUTH_ENABLED', 'false');
    vi.stubEnv('OIDC_ENABLED', 'true');
    vi.stubEnv('OIDC_ISSUER_URL', 'https://accounts.google.com');
    vi.stubEnv('OIDC_CLIENT_ID', 'test-client');
    vi.stubEnv('OIDC_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('OIDC_REDIRECT_URI', 'http://localhost:3000/api/auth/oidc/callback');
  });

  it('rejects local entry points before validation, including development login and linking', async () => {
    for (const endpoint of ['register', 'login', 'development-login', 'password-reset/request', 'password-reset/confirm', 'oidc/link']) {
      expect((await request(app).post('/api/auth/' + endpoint).send({})).status, endpoint).toBe(403);
    }
    expect((await request(app).get('/api/auth/configuration')).body)
      .toMatchObject({ registrationEnabled: false, localAuthEnabled: false, oidcEnabled: true });
  });

  it('rejects existing legacy credentials but preserves web sessions and stored passwords', async () => {
    const xml = await request(app).post('/api/fever?api=xml').send({});
    expect(xml.headers['content-type']).toContain('xml');
    expect(xml.text).toContain('<auth>0</auth>');
    const key = createFeverApiKey(user.username, 'existing-password');
    for (const call of [
      request(app).post('/api/fever').send({ api_key: key }),
      request(app).post('/api/fever').set('Cookie', 'fever_auth=' + key),
      request(app).post('/api/fever?action=login').send({ username: user.username, password: 'existing-password' })
    ]) expect((await call).body.auth).toBe(0);
    expect((await request(app).post('/api/greader/accounts/ClientLogin')
      .send({ Email: user.username, Passwd: 'existing-password' })).status).toBe(401);
    expect((await request(app).get('/api/greader/reader/api/0/user-info')
      .set('Authorization', `GoogleLogin auth=${user.username}/${createGreaderAuthToken(user)}`)).status).toBe(401);
    expect((await request(app).post('/api/auth/validate').set('Authorization', 'Bearer ' + token)).status).toBe(200);
    vi.stubEnv('LOCAL_AUTH_ENABLED', 'true');
    expect((await request(app).post('/api/auth/login')
      .send({ username: user.username, password: 'existing-password' })).status).toBe(200);
  });

  it('hides password capabilities and blocks account and admin password updates', async () => {
    const authorization = 'Bearer ' + token;
    expect((await request(app).get('/api/auth/account').set('Authorization', authorization)).body.localPasswordEnabled).toBe(false);
    expect((await request(app).get('/api/users/' + user.id).set('Authorization', authorization)).body.user.localPasswordEnabled).toBe(false);
    const values = { email: null, emailDigestEnabled: false, emailDigestTime: '08:00', emailDigestTimezone: 'UTC', emailDigestSkipWhenEmpty: true };
    expect((await request(app).patch('/api/auth/account').set('Authorization', authorization).send(values)).status).toBe(200);
    expect((await request(app).patch('/api/auth/account').set('Authorization', authorization)
      .send({ ...values, password: 'changed-password', passwordRepeat: 'changed-password' })).status).toBe(403);
    expect((await request(app).post('/api/users/' + user.id).set('Authorization', authorization)
      .send({ username: user.username, role: 'admin', password: 'changed-password' })).status).toBe(403);
    expect(await bcrypt.compare('existing-password', (await user.reload()).password)).toBe(true);
  });

  it('protects recovery and password-confirmed linking inside services', async () => {
    const hashPassword = vi.fn();
    await expect(confirmPasswordReset({ token: 'invalid', password: 'new-password', passwordRepeat: 'new-password' }, { hashPassword }))
      .rejects.toMatchObject({ code: 'LOCAL_AUTH_DISABLED', status: 403 });
    expect(hashPassword).not.toHaveBeenCalled();
    const enqueue = vi.fn();
    await expect(requestPasswordReset('test@example.com', { configuration: { enabled: true }, enqueue })).resolves.toEqual({ accepted: true });
    expect(enqueue).not.toHaveBeenCalled();
    await expect(resolveOidcIdentity({ iss: 'https://accounts.google.com', sub: 'test' }, { linkUserId: user.id }))
      .rejects.toMatchObject({ name: 'OidcLoginError' });
  });
});
