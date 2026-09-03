import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import {
  changeUserEmail,
  confirmUserEmailVerification,
  requestUserEmailVerification
} from '../../services/email/emailVerification.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { EmailVerificationToken, User, sequelize } = db;
const createdUserIds = [];

const createUser = async overrides => {
  const username = `email-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await User.create({
    username,
    email: null,
    password: 'test-password-hash',
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, 'password')),
    role: 'user',
    ...overrides
  });
  createdUserIds.push(user.id);
  return user;
};

const configuration = {
  enabled: true,
  publicAppUrl: 'https://rss.example.com'
};

describe('email verification service', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterEach(async () => {
    await EmailVerificationToken.destroy({ where: { userId: createdUserIds } });
    await User.destroy({ where: { id: createdUserIds } });
    createdUserIds.length = 0;
    vi.restoreAllMocks();
  });

  it('normalizes an owned email change, clears verification, and invalidates old tokens', async () => {
    const user = await createUser({
      email: 'old@example.com',
      emailVerifiedAt: new Date('2026-08-01T00:00:00Z')
    });
    const token = await EmailVerificationToken.create({
      userId: user.id,
      tokenHash: createFeverCredentialHash(`verification-${user.id}-${Date.now()}`),
      expiresAt: new Date('2026-10-01T00:00:00Z')
    });
    const now = new Date('2026-09-02T10:00:00Z');

    await expect(changeUserEmail(user.id, '  NEW@Example.COM ', { now })).resolves.toEqual({
      email: 'new@example.com',
      emailVerifiedAt: null
    });

    await user.reload();
    await token.reload();
    expect(user).toMatchObject({ email: 'new@example.com', emailVerifiedAt: null });
    expect(token.usedAt).toEqual(now);
  });

  it('queues a random raw token while storing only its hash for the owning user', async () => {
    const user = await createUser({ email: 'owner@example.com' });
    const enqueue = vi.fn().mockResolvedValue({ created: true });
    const rawToken = 'A'.repeat(43);

    await requestUserEmailVerification(user.id, {
      configuration,
      enqueue,
      createToken: () => rawToken,
      now: new Date('2026-09-02T10:00:00Z')
    });

    const stored = await EmailVerificationToken.findOne({ where: { userId: user.id } });
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.tokenHash).not.toContain(rawToken);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: user.id,
      recipient: 'owner@example.com',
      templateType: 'email_verification',
      templateData: {
        actionUrl: `https://rss.example.com/#verify-email-token=${rawToken}`
      }
    }), expect.objectContaining({ transaction: expect.anything() }));
  });

  it('supersedes an older unused token when verification is resent', async () => {
    const user = await createUser({ email: 'resend@example.com' });
    const enqueue = vi.fn().mockResolvedValue({ created: true });
    const firstNow = new Date('2026-09-02T10:00:00Z');
    const secondNow = new Date('2026-09-02T11:00:00Z');

    await requestUserEmailVerification(user.id, {
      configuration, enqueue, createToken: () => 'B'.repeat(43), now: firstNow
    });
    await requestUserEmailVerification(user.id, {
      configuration, enqueue, createToken: () => 'C'.repeat(43), now: secondNow
    });

    const tokens = await EmailVerificationToken.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'ASC']]
    });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].usedAt).toEqual(secondNow);
    expect(tokens[1].usedAt).toBeNull();
  });

  it('confirms once and rejects replay without returning account details', async () => {
    const user = await createUser({ email: 'confirm@example.com' });
    const enqueue = vi.fn().mockResolvedValue({ created: true });
    const rawToken = 'D'.repeat(43);
    const issuedAt = new Date('2026-09-02T10:00:00Z');
    const confirmedAt = new Date('2026-09-02T11:00:00Z');
    await requestUserEmailVerification(user.id, {
      configuration, enqueue, createToken: () => rawToken, now: issuedAt
    });

    await expect(confirmUserEmailVerification(rawToken, { now: confirmedAt }))
      .resolves.toEqual({ verified: true });
    await expect(confirmUserEmailVerification(rawToken, { now: confirmedAt }))
      .rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_INVALID' });
    await user.reload();
    expect(user.emailVerifiedAt).toEqual(confirmedAt);
  });

  it('rejects expired credentials without verifying the address', async () => {
    const user = await createUser({ email: 'expired@example.com' });
    const enqueue = vi.fn().mockResolvedValue({ created: true });
    const rawToken = 'E'.repeat(43);
    await requestUserEmailVerification(user.id, {
      configuration,
      enqueue,
      createToken: () => rawToken,
      now: new Date('2026-09-01T00:00:00Z')
    });

    await expect(confirmUserEmailVerification(rawToken, {
      now: new Date('2026-09-03T00:00:01Z')
    })).rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_INVALID' });
    await user.reload();
    expect(user.emailVerifiedAt).toBeNull();
  });
});
