import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import request from 'supertest';
import db from '../models/index.js';

const { User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('auth controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.JWT_SECRET = 'test-secret-used-for-sign-and-verify';

    const mod = await import('../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('validates a login token signed with JWT_SECRET', async () => {
    const username = uniqueName('jwt-secret-user');
    const password = 'correct-password';
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
      username,
      password: passwordHash,
      hash: crypto.createHash('md5').update(`${username}:${password}`).digest('hex'),
      role: 'user'
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();

    const validateRes = await request(app)
      .post('/api/auth/validate')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.user.username).toBe(username);
  });
});
