import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function restores authentication flags so each environment case is isolated.
const resetDevelopmentLoginEnvironment = () => {
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_ENABLED = 'false';
  delete process.env.ENABLE_DEVELOPMENT_LOGIN;
  delete process.env.DEVELOPMENT_LOGIN_USER_ID;
};

describe('auth controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.JWT_SECRET = 'test-secret-used-for-sign-and-verify';
    process.env.EMAIL_ENABLED = 'false';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  afterEach(() => {
    resetDevelopmentLoginEnvironment();
    vi.restoreAllMocks();
  });

  it('stores a protected Fever credential when registering', async () => {
    const username = uniqueName('registered-user');
    const password = 'correct-password';
    const feverApiKey = createFeverApiKey(username, password);

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        password,
        password_repeat: password
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.registered).toBe(true);

    const user = await User.findOne({ where: { username } });
    expect(await bcrypt.compare(password, user.password)).toBe(true);
    expect(user.feverCredentialHash).toBe(
      createFeverCredentialHash(feverApiKey)
    );
    expect(user.feverCredentialHash).not.toBe(feverApiKey);
  });

  it('publishes and enforces the registration email capability', async () => {
    process.env.EMAIL_ENABLED = 'true';
    const configuration = await request(app).get('/api/auth/configuration');
    const password = 'correct-password';
    const registration = await request(app).post('/api/auth/register').send({
      username: uniqueName('email-required'),
      password,
      password_repeat: password
    });

    expect(configuration.status).toBe(200);
    expect(configuration.body).toEqual({ emailEnabled: true });
    expect(registration.status).toBe(400);
    expect(registration.body).toEqual({ message: 'Please enter an email address.' });
    process.env.EMAIL_ENABLED = 'false';
  });

  it('accepts and normalizes an optional registration email', async () => {
    const username = uniqueName('registered-email-user');
    const password = 'correct-password';

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        email: '  Reader@Example.COM ',
        password,
        password_repeat: password
      });

    expect(registerRes.status).toBe(201);
    const user = await User.findOne({ where: { username } });
    expect(user.email).toBe('reader@example.com');
    expect(user.emailVerifiedAt).toBeNull();
  });

  it('rejects a duplicate registration email without exposing database details', async () => {
    const password = 'correct-password';
    const firstUsername = uniqueName('registered-email-first');
    const secondUsername = uniqueName('registered-email-second');
    const email = `${uniqueName('duplicate')}@example.com`;
    const first = await request(app).post('/api/auth/register').send({
      username: firstUsername,
      email,
      password,
      password_repeat: password
    });
    const duplicate = await request(app).post('/api/auth/register').send({
      username: secondUsername,
      email: email.toUpperCase(),
      password,
      password_repeat: password
    });

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ message: 'This email address is already in use.' });
  });

  it('registers a concurrent bootstrap loser as a normal user', async () => {
    const username = uniqueName('bootstrap-loser');
    const password = 'correct-password';
    const originalCreate = User.create.bind(User);
    const claimConflict = Object.assign(new Error('Bootstrap claim already exists'), {
      name: 'SequelizeUniqueConstraintError',
      fields: { bootstrapAdminClaim: true }
    });

    vi.spyOn(User, 'count').mockResolvedValue(0);
    vi.spyOn(User, 'create')
      .mockRejectedValueOnce(claimConflict)
      .mockImplementation(values => originalCreate(values));

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        password,
        password_repeat: password
      });

    expect(registerRes.status).toBe(201);
    const user = await User.findOne({ where: { username } });
    expect(user).toMatchObject({
      role: 'user',
      bootstrapAdminClaim: null
    });
  });

  it('validates a login token signed with JWT_SECRET', async () => {
    const username = uniqueName('jwt-secret-user');
    const password = 'correct-password';
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
      username,
      password: passwordHash,
      feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, password)),
      role: 'user'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.user.username).toBe(username);
    expect(loginRes.body.user).not.toHaveProperty('password');
    expect(loginRes.body.user).not.toHaveProperty('feverCredentialHash');

    const validateRes = await request(app)
      .post('/api/auth/validate')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.user.username).toBe(username);
    expect(validateRes.body.user).not.toHaveProperty('password');
    expect(validateRes.body.user).not.toHaveProperty(
      'feverCredentialHash'
    );
    expect(validateRes.body.agenticFeaturesEnabled).toBe(
      loginRes.body.agenticFeaturesEnabled
    );
  });

  it('automatically authenticates the configured user when development login is enabled', async () => {
    const username = uniqueName('development-login-user');
    const password = 'development-password';
    const user = await User.create({
      username,
      password: await bcrypt.hash(password, 10),
      feverCredentialHash: createFeverCredentialHash(
        createFeverApiKey(username, password)
      ),
      role: 'user'
    });
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEVELOPMENT_LOGIN = 'true';
    process.env.DEVELOPMENT_LOGIN_USER_ID = String(user.id);

    const loginRes = await request(app)
      .post('/api/auth/development-login');

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
    expect(loginRes.body.user).toMatchObject({ id: user.id, username });
    expect(loginRes.body.user).not.toHaveProperty('password');
    expect(loginRes.body.user).not.toHaveProperty('feverCredentialHash');

    const validateRes = await request(app)
      .post('/api/auth/validate')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.user.id).toBe(user.id);
  });

  it('keeps normal authentication required when development login is disabled', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEVELOPMENT_LOGIN = 'false';
    process.env.DEVELOPMENT_LOGIN_USER_ID = '1';

    const loginRes = await request(app)
      .post('/api/auth/development-login');
    const validateRes = await request(app)
      .post('/api/auth/validate');

    expect(loginRes.status).toBe(404);
    expect(loginRes.body).not.toHaveProperty('token');
    expect(validateRes.status).toBe(400);
  });

  it('never enables development login in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEVELOPMENT_LOGIN = 'true';
    process.env.DEVELOPMENT_LOGIN_USER_ID = '1';

    const loginRes = await request(app)
      .post('/api/auth/development-login');

    expect(loginRes.status).toBe(404);
    expect(loginRes.body).not.toHaveProperty('token');
  });

  it.each([
    ['missing user id', undefined],
    ['unknown user', '2147483647']
  ])('fails safely for a %s', async (_label, configuredUserId) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEVELOPMENT_LOGIN = 'true';
    if (configuredUserId) {
      process.env.DEVELOPMENT_LOGIN_USER_ID = configuredUserId;
    } else {
      delete process.env.DEVELOPMENT_LOGIN_USER_ID;
    }

    const loginRes = await request(app)
      .post('/api/auth/development-login');

    expect(loginRes.status).toBe(503);
    expect(loginRes.body).toEqual({
      message: 'Development login is unavailable.'
    });
    expect(loginRes.body).not.toHaveProperty('token');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Development login error:')
    );
  });
});
