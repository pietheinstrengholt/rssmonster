import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { EmailVerificationToken, User, sequelize } = db;
const createdUserIds = [];
let app;

const createUser = async ({ role = 'user', email = null, emailVerifiedAt = null } = {}) => {
  const username = `email-controller-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'correct-password';
  const user = await User.create({
    username,
    email,
    emailVerifiedAt,
    password: await bcrypt.hash(password, 4),
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, password)),
    role
  });
  createdUserIds.push(user.id);
  const login = await request(app).post('/api/auth/login').send({ username, password });
  return { user, token: login.body.token };
};

describe('email verification controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.JWT_SECRET = 'email-controller-test-secret';
    process.env.EMAIL_ENABLED = 'false';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  afterAll(async () => {
    await EmailVerificationToken.destroy({ where: { userId: createdUserIds } });
    await User.destroy({ where: { id: createdUserIds } });
  });

  it('requires authentication for email changes and verification requests', async () => {
    const change = await request(app).patch('/api/auth/email').send({ email: 'x@example.com' });
    const verification = await request(app).post('/api/auth/verify-email/request');

    expect(change.status).toBe(400);
    expect(verification.status).toBe(400);
  });

  it('changes only the authenticated account and clears its verification status', async () => {
    const owner = await createUser({
      email: 'owner-old@example.com',
      emailVerifiedAt: new Date()
    });
    const other = await createUser({ email: 'other@example.com' });

    const response = await request(app)
      .patch('/api/auth/email')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: ' OWNER-NEW@EXAMPLE.COM ' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: 'owner-new@example.com',
      emailVerifiedAt: null
    });
    await owner.user.reload();
    await other.user.reload();
    expect(owner.user.email).toBe('owner-new@example.com');
    expect(other.user.email).toBe('other@example.com');
  });

  it('reports disabled delivery without exposing address or token data', async () => {
    const owner = await createUser({ email: 'disabled@example.com' });
    const response = await request(app)
      .post('/api/auth/verify-email/request')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('disabled@example.com');
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('tokenHash');
  });

  it('confirms an opaque token once and rejects its replay', async () => {
    const owner = await createUser({ email: 'route-confirm@example.com' });
    const rawToken = 'F'.repeat(43);
    await EmailVerificationToken.create({
      userId: owner.user.id,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000)
    });

    const confirmed = await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: rawToken });
    const replay = await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: rawToken });

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({ verified: true, message: 'Email address verified.' });
    expect(confirmed.body).not.toHaveProperty('user');
    expect(replay.status).toBe(400);
    expect(replay.body).not.toHaveProperty('token');
  });

  it('shows administrators email verification status but never token records', async () => {
    const admin = await createUser({ role: 'admin' });
    const verifiedAt = new Date();
    const member = await createUser({ email: 'visible@example.com', emailVerifiedAt: verifiedAt });
    await EmailVerificationToken.create({
      userId: member.user.id,
      tokenHash: createHash('sha256')
        .update(`admin-visible-${member.user.id}-${Date.now()}`)
        .digest('hex'),
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${admin.token}`);
    const listed = response.body.users.find(user => user.id === member.user.id);

    expect(response.status).toBe(200);
    expect(listed.email).toBe('visible@example.com');
    expect(listed.emailVerifiedAt).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain('tokenHash');
    expect(response.body).not.toHaveProperty('emailVerificationTokens');
  });

  it('lets administrators change an account email and invalidates prior verification', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser({
      email: 'old-admin-managed@example.com',
      emailVerifiedAt: new Date()
    });
    const oldToken = await EmailVerificationToken.create({
      userId: member.user.id,
      tokenHash: createHash('sha256')
        .update(`admin-change-${member.user.id}-${Date.now()}`)
        .digest('hex'),
      expiresAt: new Date(Date.now() + 60_000)
    });

    const response = await request(app)
      .post(`/api/users/${member.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        username: member.user.username,
        email: ' NEW-ADMIN-MANAGED@EXAMPLE.COM ',
        role: member.user.role,
        password: ''
      });

    expect(response.status).toBe(200);
    await member.user.reload();
    await oldToken.reload();
    expect(member.user.email).toBe('new-admin-managed@example.com');
    expect(member.user.emailVerifiedAt).toBeNull();
    expect(oldToken.usedAt).toBeTruthy();
  });
});
