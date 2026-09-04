import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { BriefingPreference, EmailDelivery, PasswordResetToken, User, sequelize } = db;
const createdUserIds = [];
const originalEnvironment = {};
let app;

const emailEnvironment = {
  EMAIL_ENABLED: 'true',
  PUBLIC_APP_URL: 'https://rss.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_REQUIRE_TLS: 'true',
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  SMTP_PASSWORD_FILE: '',
  EMAIL_FROM: 'RSSMonster <rssmonster@example.com>',
  EMAIL_REPLY_TO: ''
};

const createUser = async ({ emailVerified = true } = {}) => {
  const username = `account-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'current-password';
  const user = await User.create({
    username,
    email: `${username}@example.com`,
    emailVerifiedAt: emailVerified ? new Date() : null,
    password: await bcrypt.hash(password, 4),
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, password))
  });
  createdUserIds.push(user.id);
  const login = await request(app).post('/api/auth/login').send({ username, password });
  return { user, token: login.body.token };
};

describe('account settings controller', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries(emailEnvironment)) {
      originalEnvironment[name] = process.env[name];
      process.env[name] = value;
    }
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  afterAll(async () => {
    await EmailDelivery.destroy({ where: { userId: createdUserIds } });
    await PasswordResetToken.destroy({ where: { userId: createdUserIds } });
    await BriefingPreference.destroy({ where: { userId: createdUserIds } });
    await User.destroy({ where: { id: createdUserIds } });
    for (const name of Object.keys(emailEnvironment)) {
      if (originalEnvironment[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnvironment[name];
    }
  });

  it('returns the fixed username and digest defaults without credentials', async () => {
    const owner = await createUser();
    const response = await request(app)
      .get('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      username: owner.user.username,
      email: owner.user.email,
      emailServiceEnabled: true,
      emailDigestConfigured: false,
      emailDigestEnabled: false,
      emailDigestTime: '08:00',
      emailDigestSkipWhenEmpty: true,
      passwordChanged: false
    });
    expect(response.body.emailDigestTimezone).toBeTruthy();
    expect(response.body.serverTimezone).toBeTruthy();
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('feverCredentialHash');
  });

  it('stores digest settings for the authenticated user only', async () => {
    const owner = await createUser();
    const other = await createUser();
    const originalPasswordHash = owner.user.password;
    const originalFeverCredentialHash = owner.user.feverCredentialHash;
    const originalPasswordChangedAt = owner.user.passwordChangedAt;
    const response = await request(app)
      .patch('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        email: owner.user.email,
        password: '',
        passwordRepeat: '',
        emailDigestEnabled: true,
        emailDigestTime: '09:30',
        emailDigestTimezone: 'Europe/Amsterdam',
        emailDigestSkipWhenEmpty: false
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      username: owner.user.username,
      emailDigestEnabled: true,
      emailDigestTime: '09:30',
      emailDigestTimezone: 'Europe/Amsterdam',
      emailDigestSkipWhenEmpty: false,
      passwordChanged: false
    });
    const preference = await BriefingPreference.findOne({ where: { userId: owner.user.id } });
    expect(preference.emailDigestEnabled).toBe(true);
    expect(await BriefingPreference.findOne({ where: { userId: other.user.id } })).toBeNull();

    await owner.user.reload();
    expect(owner.user.password).toBe(originalPasswordHash);
    expect(owner.user.feverCredentialHash).toBe(originalFeverCredentialHash);
    expect(owner.user.passwordChangedAt).toBe(originalPasswordChangedAt);

    const existingSession = await request(app)
      .get('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(existingSession.status).toBe(200);
  });

  it('rejects mismatched passwords without changing the credential', async () => {
    const owner = await createUser();
    const originalPasswordHash = owner.user.password;
    const response = await request(app)
      .patch('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        email: owner.user.email,
        password: 'updated-password',
        passwordRepeat: 'different-password',
        emailDigestEnabled: false,
        emailDigestTime: '08:00',
        emailDigestTimezone: 'UTC',
        emailDigestSkipWhenEmpty: true
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PASSWORD_MISMATCH');
    await owner.user.reload();
    expect(owner.user.password).toBe(originalPasswordHash);
  });

  it('requires a verified address before enabling digest delivery', async () => {
    const owner = await createUser();
    await owner.user.update({ emailVerifiedAt: null });
    const response = await request(app)
      .patch('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        email: owner.user.email,
        password: '',
        passwordRepeat: '',
        emailDigestEnabled: true,
        emailDigestTime: '08:00',
        emailDigestTimezone: 'UTC',
        emailDigestSkipWhenEmpty: true
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await BriefingPreference.findOne({ where: { userId: owner.user.id } })).toBeNull();
  });

  it('rotates password derivatives and invalidates the existing session', async () => {
    const owner = await createUser();
    const newPassword = 'updated-password';
    const response = await request(app)
      .patch('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        email: owner.user.email,
        password: newPassword,
        passwordRepeat: newPassword,
        emailDigestEnabled: false,
        emailDigestTime: '08:00',
        emailDigestTimezone: 'UTC',
        emailDigestSkipWhenEmpty: true
      });

    expect(response.status).toBe(200);
    expect(response.body.passwordChanged).toBe(true);
    await owner.user.reload();
    expect(await bcrypt.compare(newPassword, owner.user.password)).toBe(true);
    expect(owner.user.feverCredentialHash).toBe(createFeverCredentialHash(
      createFeverApiKey(owner.user.username, newPassword)
    ));
    expect(owner.user.passwordChangedAt).toBeTruthy();

    const staleSession = await request(app)
      .get('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(staleSession.status).toBe(400);
  });

  it('clears verification and pauses digest delivery when the email changes', async () => {
    const owner = await createUser();
    const response = await request(app)
      .patch('/api/auth/account')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        email: `changed-${owner.user.id}@example.com`,
        password: '',
        passwordRepeat: '',
        emailDigestEnabled: true,
        emailDigestTime: '08:00',
        emailDigestTimezone: 'UTC',
        emailDigestSkipWhenEmpty: true
      });

    expect(response.status).toBe(200);
    expect(response.body.emailVerifiedAt).toBeNull();
    expect(response.body.emailDigestEnabled).toBe(false);
  });

  it('queues an empty-state daily briefing test for the verified owner', async () => {
    const owner = await createUser();
    const response = await request(app)
      .post('/api/auth/account/daily-briefing-test')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      queued: true,
      articleCount: 0,
      message: 'Daily briefing test email queued.'
    });
    const delivery = await EmailDelivery.findOne({
      where: { userId: owner.user.id, messageType: 'daily_digest' }
    });
    expect(delivery).toMatchObject({
      recipient: owner.user.email,
      status: 'pending'
    });
    expect(delivery.payload.subject).toBe('RSSMonster daily briefing test — example email');
    expect(delivery.payload.text).toContain('No new articles were received');
    expect(delivery.payload.html).toContain('No new articles were received');
  });

  it('rejects a daily briefing test when the current address is unverified', async () => {
    const owner = await createUser();
    await owner.user.update({ emailVerifiedAt: null });
    const response = await request(app)
      .post('/api/auth/account/daily-briefing-test')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await EmailDelivery.count({ where: { userId: owner.user.id } })).toBe(0);
  });
});
