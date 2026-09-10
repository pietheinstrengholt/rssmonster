import { generateKeyPairSync, createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import * as client from 'openid-client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { createOidcService, oidcService, hashOidcValue } from '../../services/auth/oidc.js';

// Rate limiting has separate tests; these cases exercise the protocol and persistence boundaries.
vi.mock('../../middleware/rateLimit.js', async importOriginal => ({
  ...await importOriginal(),
  createRateLimiter: () => (_req, _res, next) => next()
}));

const issuer = 'https://identity.example.com';
const origin = 'http://localhost:3000';
const redirectUri = `${origin}/api/auth/oidc/callback`;
const configuration = { issuerUrl: issuer, clientId: 'reader', clientSecret: 'test-client-secret', redirectUri, frontendUrl: origin + '/', accessPolicy: { allowedEmailDomains: [], allowedGroups: [], groupsClaim: 'groups' }, scopes: ['openid', 'email'], autoProvision: false };
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
let app, user, service, authorization, transport, claimsOverride, signKey, clock;
const password = 'existing-user-password';

const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const cookie = response => response.headers['set-cookie'][0].split(';')[0];
const callbackUrl = state => `/api/auth/oidc/callback?code=provider-code&state=${state}`;
const linkIdentity = async (subject = 'provider-user', target = user) => db.OidcIdentity.create({
  identityHash: hashOidcValue(JSON.stringify([issuer, subject])), issuer, subject, userId: target.id
});

beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true';
  app = (await import('../../app.js')).default;
  await db.sequelize.authenticate();
});

beforeEach(async () => {
  vi.stubEnv('LOCAL_AUTH_ENABLED', 'true');
  vi.stubEnv('OIDC_FRONTEND_URL', '');
  vi.stubEnv('OIDC_ALLOWED_EMAIL_DOMAINS', '');
  vi.stubEnv('OIDC_ALLOWED_GROUPS', '');
  vi.stubEnv('OIDC_GROUPS_CLAIM', '');
  vi.stubEnv('OIDC_ENABLED', 'true');
  vi.stubEnv('OIDC_ISSUER_URL', issuer);
  vi.stubEnv('OIDC_CLIENT_ID', configuration.clientId);
  vi.stubEnv('OIDC_CLIENT_SECRET', configuration.clientSecret);
  vi.stubEnv('OIDC_REDIRECT_URI', redirectUri);
  vi.stubEnv('OIDC_SCOPES', 'openid email');
  vi.stubEnv('OIDC_AUTO_PROVISION', 'false');
  vi.stubEnv('EMAIL_ENABLED', 'false');
  vi.stubEnv('ALLOW_REGISTRATION', 'false');
  await db.OidcTransaction.destroy({ where: {} });
  await db.OidcIdentity.destroy({ where: {} });
  user = await db.User.create({ username: `oidc-${randomBytes(8).toString('hex')}`, password: await bcrypt.hash(password, 4), feverCredentialHash: randomBytes(32).toString('hex') });
  claimsOverride = {};
  signKey = privateKey;
  clock = new Date();
  transport = vi.fn(async (url, options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/.well-known/openid-configuration') return json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256']
    });
    if (pathname === '/jwks') return json({ keys: [publicJwk] });
    if (pathname === '/token') {
      const body = new URLSearchParams(options.body);
      expect(body.get('client_secret')).toBe(configuration.clientSecret);
      expect(body.get('redirect_uri')).toBe(redirectUri);
      expect(createHash('sha256').update(body.get('code_verifier')).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));
      return json({
        access_token: 'provider-access-token', token_type: 'Bearer',
        id_token: jwt.sign({
          iss: issuer, sub: 'provider-user', aud: configuration.clientId,
          nonce: authorization.searchParams.get('nonce'), exp: Math.floor(Date.now() / 1000) + 300,
          ...claimsOverride
        }, signKey, { algorithm: 'RS256', keyid: 'test-key' })
      });
    }
    throw new Error('Unexpected provider request');
  });
  const protocol = {
    ...client,
    discovery: (server, id, secret, auth, options) => client.discovery(server, id, secret, auth, { ...options, [client.customFetch]: transport })
  };
  service = createOidcService({ protocol, now: () => clock });
  for (const method of ['start', 'callback', 'exchange']) vi.spyOn(oidcService, method).mockImplementation(service[method]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const startLogin = async () => {
  const response = await request(app).get('/api/auth/oidc/login');
  expect(response.status).toBe(302);
  authorization = new URL(response.headers.location);
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(response.headers['set-cookie'][0]).toContain('SameSite=Lax');
  return { browser: cookie(response), state: authorization.searchParams.get('state') };
};

const finish = async ({ browser, state }) => {
  const response = await request(app).get(callbackUrl(state)).set('Cookie', browser);
  expect(response.status).toBe(303);
  const location = new URL(response.headers.location);
  expect(location.origin).toBe(origin);
  return new URLSearchParams(location.hash.slice(1));
};

describe('server-owned OIDC flow', () => {
  it('returns the standard session only after a browser-bound, one-time POST exchange', async () => {
    await linkIdentity();
    const attempt = await startLogin();
    const result = await finish(attempt);
    const code = result.get('oidc-code');
    expect(code).toBeTruthy();
    const response = await request(app).post('/api/auth/oidc/exchange').set('Origin', origin).set('Cookie', attempt.browser).send({ code });
    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(user.id);
    expect(response.body.user).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('access_token');
    expect(jwt.verify(response.body.token, process.env.JWT_SECRET).purpose).toBe('session');
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await finish(attempt)).get('oidc-error')).toBe('failed');
    const replay = await request(app).post('/api/auth/oidc/exchange').set('Origin', origin).set('Cookie', attempt.browser).send({ code });
    expect(replay.status).toBe(401);
  });

  it('does not resolve unknown identities by matching email or provision an account', async () => {
    await user.update({ email: 'existing@example.com', emailVerifiedAt: new Date() });
    claimsOverride = { email: user.email, email_verified: true };
    const count = await db.User.count();
    expect((await finish(await startLogin())).get('oidc-error')).toBe('failed');
    expect(await db.User.count()).toBe(count);
  });

  it('requires the initiating browser and does not consume a callback from another browser', async () => {
    await linkIdentity();
    const attempt = await startLogin();
    expect((await finish({ ...attempt, browser: 'rssmonster_oidc=wrong' })).get('oidc-error')).toBe('failed');
    expect((await finish(attempt)).get('oidc-code')).toBeTruthy();
  });

  it.each([
    { nonce: 'wrong' }, { aud: 'wrong-client' }, { iss: 'https://wrong.example.com' }, { exp: 1 }
  ])('rejects invalid ID token claims %j', async override => {
    await linkIdentity();
    claimsOverride = override;
    expect((await finish(await startLogin())).get('oidc-error')).toBe('failed');
  });

  it('verifies the ID token signature against discovery JWKS', async () => {
    await linkIdentity();
    signKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect((await finish(await startLogin())).get('oidc-error')).toBe('failed');
  });

  it('rejects expired attempts, invalid state and provider cancellation', async () => {
    const attempt = await startLogin();
    expect((await finish({ ...attempt, state: 'wrong' })).get('oidc-error')).toBe('failed');
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect((await finish(attempt)).get('oidc-error')).toBe('failed');
    const next = await startLogin();
    const denied = await request(app).get(`/api/auth/oidc/callback?error=access_denied&state=${next.state}`).set('Cookie', next.browser);
    expect(denied.headers.location).toBe(`${origin}/#oidc-error=failed`);
  });

  it('requires same-origin exchange and the initiating cookie', async () => {
    await linkIdentity();
    const attempt = await startLogin();
    const code = (await finish(attempt)).get('oidc-code');
    expect((await request(app).post('/api/auth/oidc/exchange').set('Origin', 'https://attacker.example').set('Cookie', attempt.browser).send({ code })).status).toBe(403);
    expect((await request(app).post('/api/auth/oidc/exchange').set('Origin', origin).send({ code })).status).toBe(401);
    const responses = await Promise.all([1, 2].map(() => request(app).post('/api/auth/oidc/exchange').set('Origin', origin).set('Cookie', attempt.browser).send({ code })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
  });

  it('rejects password changes between callback and handoff', async () => {
    await linkIdentity();
    const attempt = await startLogin();
    const code = (await finish(attempt)).get('oidc-code');
    await user.update({ passwordChangedAt: new Date() });
    expect((await request(app).post('/api/auth/oidc/exchange').set('Origin', origin).set('Cookie', attempt.browser).send({ code })).status).toBe(401);
  });

  it('rejects expired handoffs and configuration changes between redirects', async () => {
    await linkIdentity();
    const attempt = await startLogin();
    const code = (await finish(attempt)).get('oidc-code');
    clock = new Date(clock.getTime() + 61_000);
    expect((await request(app).post('/api/auth/oidc/exchange').set('Origin', origin).set('Cookie', attempt.browser).send({ code })).status).toBe(401);
    const next = await startLogin();
    vi.stubEnv('OIDC_CLIENT_ID', 'replacement-client');
    expect((await finish(next)).get('oidc-error')).toBe('failed');
  });

  it('keeps email enrollment required even if the provider reports a verified email', async () => {
    await linkIdentity();
    claimsOverride = { email: 'provider@example.com', email_verified: true };
    const attempt = await startLogin();
    const code = (await finish(attempt)).get('oidc-code');
    vi.stubEnv('EMAIL_ENABLED', 'true');
    const response = await request(app).post('/api/auth/oidc/exchange').set('Origin', origin).set('Cookie', attempt.browser).send({ code });
    expect(response.status).toBe(200);
    expect(response.body.emailVerificationRequired).toBe(true);
    expect(response.body).not.toHaveProperty('token');
    expect((await user.reload()).emailVerifiedAt).toBeNull();
  });

  it('does not let another account claim an already linked identity', async () => {
    await linkIdentity();
    const other = await db.User.create({ username: `other-${randomBytes(8).toString('hex')}`, password: user.password, feverCredentialHash: randomBytes(32).toString('hex') });
    const started = await service.start(configuration, { linkUser: other });
    authorization = new URL(started.authorizationUrl);
    expect((await finish({ browser: `rssmonster_oidc=${started.browser}`, state: authorization.searchParams.get('state') })).get('oidc-error')).toBe('failed');
    expect((await db.OidcIdentity.findOne()).userId).toBe(user.id);
  });

  it('links only after local authentication and current-password confirmation', async () => {
    const localLogin = await request(app).post('/api/auth/login').send({ username: user.username, password });
    const token = localLogin.body.token;
    const wrong = await request(app).post('/api/auth/oidc/link').set('Origin', origin).set('Authorization', `Bearer ${token}`).send({ password: 'wrong' });
    expect(wrong.status).toBe(401);
    const linked = await request(app).post('/api/auth/oidc/link').set('Origin', origin).set('Authorization', `Bearer ${token}`).send({ password });
    expect(linked.status).toBe(200);
    authorization = new URL(linked.body.authorizationUrl);
    const result = await finish({ state: authorization.searchParams.get('state'), browser: cookie(linked) });
    expect(result.get('oidc-code')).toBeTruthy();
    expect((await db.OidcIdentity.findOne()).userId).toBe(user.id);
  });

  it('keeps the public configuration free of provider secrets and disables routes when OIDC is off', async () => {
    const response = await request(app).get('/api/auth/configuration');
    expect(response.body).toEqual({ registrationEnabled: false, localAuthEnabled: true, developmentLoginEnabled: false, emailEnabled: false, oidcEnabled: true });
    vi.stubEnv('OIDC_ENABLED', 'false');
    expect((await request(app).get('/api/auth/oidc/login')).status).toBe(404);
  });

  it('does not advertise development login when local authentication is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_DEVELOPMENT_LOGIN', 'true');
    vi.stubEnv('LOCAL_AUTH_ENABLED', 'false');
    const response = await request(app).get('/api/auth/configuration');
    expect(response.status).toBe(200);
    expect(response.body.developmentLoginEnabled).toBe(false);
  });
});


describe('separate frontend port', () => {
  it('returns a single-use code to the configured frontend and permits its credentialed exchange', async () => {
    vi.stubEnv('OIDC_FRONTEND_URL', 'http://localhost:8080');
    await linkIdentity();
    const attempt = await startLogin();
    const callback = await request(app).get(callbackUrl(attempt.state)).set('Cookie', attempt.browser);
    const destination = new URL(callback.headers.location);
    expect(destination.origin).toBe('http://localhost:8080');
    const code = new URLSearchParams(destination.hash.slice(1)).get('oidc-code');
    expect(code).toBeTruthy();
    const preflight = await request(app).options('/api/auth/oidc/exchange').set('Origin', 'http://localhost:8080')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    for (const disallowed of [origin, 'http://evil.example']) {
      const rejected = await request(app).post('/api/auth/oidc/exchange').set('Origin', disallowed).set('Cookie', attempt.browser).send({ code });
      expect(rejected.status).toBe(403);
      expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    }
    const exchange = await request(app).post('/api/auth/oidc/exchange').set('Origin', 'http://localhost:8080').set('Cookie', attempt.browser).send({ code });
    expect(exchange.status).toBe(200);
    expect(exchange.body.user.id).toBe(user.id);
    expect(exchange.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(exchange.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns errors to the frontend without using caller-supplied destinations', async () => {
    vi.stubEnv('OIDC_FRONTEND_URL', 'http://localhost:8080');
    const attempt = await startLogin();
    const response = await request(app).get(callbackUrl(attempt.state) + '&returnTo=https://evil.example').set('Cookie', attempt.browser);
    expect(response.headers.location).toBe('http://localhost:8080/#oidc-error=failed');
  });

  it('accepts linking requests from the configured frontend', async () => {
    vi.stubEnv('OIDC_FRONTEND_URL', 'http://localhost:8080');
    const login = await request(app).post('/api/auth/login').send({ username: user.username, password });
    const response = await request(app).post('/api/auth/oidc/link').set('Origin', 'http://localhost:8080')
      .set('Authorization', 'Bearer ' + login.body.token).send({ password });
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8080');
  });
});
