import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import db from '../../models/index.js';
import { requestPasswordReset } from '../../services/email/passwordReset.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { PasswordResetToken, User, sequelize } = db;
const createdUserIds = [];
let app;

const createUser = async () => {
  const username = `reset-controller-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'original-password';
  const user = await User.create({
    username,
    email: `${username}@example.com`,
    emailVerifiedAt: new Date(),
    password: await bcrypt.hash(password, 4),
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, password)),
    role: 'user'
  });
  createdUserIds.push(user.id);
  return { user, username, password };
};

describe('password reset controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.JWT_SECRET = 'password-reset-controller-secret';
    process.env.EMAIL_ENABLED = 'false';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  afterAll(async () => {
    await PasswordResetToken.destroy({ where: { userId: createdUserIds } });
    await User.destroy({ where: { id: createdUserIds } });
  });

  it('returns an identical response for known and unknown addresses', async () => {
    const { user } = await createUser();
    const known = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: user.email });
    const unknown = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ email: 'missing@example.com' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({
      accepted: true,
      message: 'If that address can receive password resets, an email has been queued.'
    });
  });

  it('invalidates an existing JWT and permits a new session after confirmation', async () => {
    const account = await createUser();
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: account.username, password: account.password });
    const rawToken = 'H'.repeat(43);
    await requestPasswordReset(account.user.email, {
      configuration: { enabled: true, publicAppUrl: 'https://rss.example.com' },
      enqueue: vi.fn().mockResolvedValue({ created: true }),
      createToken: () => rawToken,
      cooldownMs: 0
    });

    const confirmation = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({
        token: rawToken,
        password: 'replacement-password',
        passwordRepeat: 'replacement-password'
      });
    const oldValidation = await request(app)
      .post('/api/auth/validate')
      .set('Authorization', `Bearer ${oldLogin.body.token}`);
    const oldPasswordLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: account.username, password: account.password });
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: account.username, password: 'replacement-password' });
    const newValidation = await request(app)
      .post('/api/auth/validate')
      .set('Authorization', `Bearer ${newLogin.body.token}`);

    expect(confirmation.status).toBe(200);
    expect(oldValidation.status).toBe(400);
    expect(oldPasswordLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
    expect(newValidation.status).toBe(200);
  });

  it('validates confirmation passwords without exposing token state', async () => {
    const response = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({
        token: 'I'.repeat(43),
        password: 'short',
        passwordRepeat: 'different'
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'PASSWORD_INVALID',
      message: 'Password must be between 8 and 128 characters.'
    });
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('tokenHash');
  });
});
