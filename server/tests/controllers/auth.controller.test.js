import { beforeAll, describe, expect, it } from 'vitest';
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

describe('auth controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.JWT_SECRET = 'test-secret-used-for-sign-and-verify';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

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

    const user = await User.findOne({ where: { username } });
    expect(await bcrypt.compare(password, user.password)).toBe(true);
    expect(user.feverCredentialHash).toBe(
      createFeverCredentialHash(feverApiKey)
    );
    expect(user.feverCredentialHash).not.toBe(feverApiKey);
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
  });
});
