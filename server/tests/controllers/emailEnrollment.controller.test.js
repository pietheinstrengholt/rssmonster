import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const {
  EmailDelivery,
  EmailVerificationToken,
  User,
  sequelize
} = db;
const createdUserIds = [];
let app;

const createUser = async ({ email = null, emailVerifiedAt = null } = {}) => {
  const username = `enrollment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'correct-password';
  const user = await User.create({
    username,
    email,
    emailVerifiedAt,
    password: await bcrypt.hash(password, 4),
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, password)),
    role: 'user'
  });
  createdUserIds.push(user.id);
  return { user, username, password };
};

const verificationTokenFromDelivery = delivery => {
  const url = delivery.payload.text.match(/https:\/\/[^\s]+/)?.[0];
  return new URLSearchParams(new URL(url).hash.slice(1)).get('verify-email-token');
};

describe('email enrollment controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.JWT_SECRET = 'email-enrollment-test-secret';
    process.env.EMAIL_ENABLED = 'true';
    process.env.PUBLIC_APP_URL = 'https://rss.example.com';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_REQUIRE_TLS = 'true';
    process.env.EMAIL_FROM = 'RSSMonster <rssmonster@example.com>';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  afterAll(async () => {
    await EmailDelivery.destroy({ where: { userId: createdUserIds } });
    await EmailVerificationToken.destroy({ where: { userId: createdUserIds } });
    await User.destroy({ where: { id: createdUserIds } });
    process.env.EMAIL_ENABLED = 'false';
  });

  it('blocks normal login until enrollment is verified and permits correcting the address', async () => {
    const account = await createUser();
    const login = await request(app).post('/api/auth/login').send({
      username: account.username,
      password: account.password
    });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      emailVerificationRequired: true,
      email: null
    });
    expect(login.body).not.toHaveProperty('token');
    const enrollmentToken = login.body.emailEnrollmentToken;

    await request(app)
      .post('/api/auth/validate')
      .set('Authorization', `Bearer ${enrollmentToken}`)
      .expect(400);

    const first = await request(app)
      .put('/api/auth/email-enrollment')
      .set('Authorization', `Bearer ${enrollmentToken}`)
      .send({ email: 'mistkae@example.com' });
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ email: 'mistkae@example.com', verified: false });
    const firstDelivery = await EmailDelivery.findOne({
      where: { userId: account.user.id, recipient: 'mistkae@example.com' }
    });
    const firstToken = verificationTokenFromDelivery(firstDelivery);

    const corrected = await request(app)
      .put('/api/auth/email-enrollment')
      .set('Authorization', `Bearer ${enrollmentToken}`)
      .send({ email: 'correct@example.com' });
    expect(corrected.status).toBe(202);
    expect(corrected.body).toMatchObject({ email: 'correct@example.com', verified: false });
    const correctedDelivery = await EmailDelivery.findOne({
      where: { userId: account.user.id, recipient: 'correct@example.com' }
    });
    const correctedToken = verificationTokenFromDelivery(correctedDelivery);

    await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: firstToken })
      .expect(400);
    await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: correctedToken })
      .expect(200);

    const status = await request(app)
      .get('/api/auth/email-enrollment')
      .set('Authorization', `Bearer ${enrollmentToken}`);
    expect(status.body).toEqual({ email: 'correct@example.com', verified: true });

    const normalLogin = await request(app).post('/api/auth/login').send({
      username: account.username,
      password: account.password
    });
    expect(normalLogin.status).toBe(200);
    expect(normalLogin.body.token).toBeTruthy();
    expect(normalLogin.body).not.toHaveProperty('emailEnrollmentToken');
  });

  it('keeps an existing unverified address visible and supports resending', async () => {
    const account = await createUser({ email: 'waiting@example.com' });
    const login = await request(app).post('/api/auth/login').send({
      username: account.username,
      password: account.password
    });
    expect(login.body).toMatchObject({
      emailVerificationRequired: true,
      email: 'waiting@example.com'
    });

    const resend = await request(app)
      .post('/api/auth/email-enrollment/resend')
      .set('Authorization', `Bearer ${login.body.emailEnrollmentToken}`);
    expect(resend.status).toBe(202);
    expect(resend.body).toMatchObject({
      email: 'waiting@example.com',
      verified: false
    });
  });
});
