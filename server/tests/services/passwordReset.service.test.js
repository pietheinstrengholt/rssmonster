import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import {
  confirmPasswordReset,
  PASSWORD_RESET_ACCOUNT_COOLDOWN_MS,
  requestPasswordReset
} from '../../services/email/passwordReset.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { PasswordResetToken, User, sequelize } = db;
const createdUserIds = [];
const configuration = { enabled: true, publicAppUrl: 'https://rss.example.com' };

const createUser = async (overrides = {}) => {
  const username = `reset-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = 'original-password';
  const user = await User.create({
    username,
    email: `${username}@example.com`,
    emailVerifiedAt: new Date(),
    password: await bcrypt.hash(password, 4),
    feverCredentialHash: createFeverCredentialHash(createFeverApiKey(username, password)),
    role: 'user',
    ...overrides
  });
  createdUserIds.push(user.id);
  return user;
};

const requestWithToken = (user, rawToken, options = {}) => requestPasswordReset(user.email, {
  configuration,
  enqueue: vi.fn().mockResolvedValue({ created: true }),
  createToken: () => rawToken,
  cooldownMs: 0,
  ...options
});

describe('password reset service', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  afterEach(async () => {
    await PasswordResetToken.destroy({ where: { userId: createdUserIds } });
    await User.destroy({ where: { id: createdUserIds } });
    createdUserIds.length = 0;
    vi.restoreAllMocks();
  });

  it('returns the same acceptance for unknown, malformed, unverified, and known addresses', async () => {
    const known = await createUser();
    const unverified = await createUser({ emailVerifiedAt: null });
    const enqueue = vi.fn().mockResolvedValue({ created: true });
    const options = {
      configuration,
      enqueue,
      createToken: () => 'A'.repeat(43)
    };

    const results = await Promise.all([
      requestPasswordReset(known.email, options),
      requestPasswordReset('missing@example.com', options),
      requestPasswordReset('not-an-email', options),
      requestPasswordReset(unverified.email, options)
    ]);

    expect(results).toEqual(Array(4).fill({ accepted: true }));
    expect(enqueue).toHaveBeenCalledOnce();
    expect(await PasswordResetToken.count({ where: { userId: known.id } })).toBe(1);
    expect(await PasswordResetToken.count({ where: { userId: unverified.id } })).toBe(0);
  });

  it('stores only a token hash and supersedes older unused credentials', async () => {
    const user = await createUser();
    const oldToken = await PasswordResetToken.create({
      userId: user.id,
      tokenHash: createHash('sha256').update(`old-${user.id}-${Date.now()}`).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - PASSWORD_RESET_ACCOUNT_COOLDOWN_MS - 1000),
      updatedAt: new Date(Date.now() - PASSWORD_RESET_ACCOUNT_COOLDOWN_MS - 1000)
    });
    const rawToken = 'B'.repeat(43);
    const enqueue = vi.fn().mockResolvedValue({ created: true });

    await requestPasswordReset(user.email, {
      configuration,
      enqueue,
      createToken: () => rawToken,
      cooldownMs: 0
    });

    await oldToken.reload();
    const current = await PasswordResetToken.findOne({
      where: { userId: user.id, usedAt: null }
    });
    expect(oldToken.usedAt).not.toBeNull();
    expect(current.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(current.tokenHash).not.toContain(rawToken);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      templateType: 'password_reset',
      recipient: user.email,
      templateData: {
        actionUrl: `https://rss.example.com/#reset-password-token=${rawToken}`
      }
    }), expect.objectContaining({ transaction: expect.anything() }));
  });

  it('serializes concurrent requests behind the per-account cooldown', async () => {
    const user = await createUser();
    const enqueue = vi.fn().mockResolvedValue({ created: true });
    const now = new Date();

    const results = await Promise.all([
      requestPasswordReset(user.email, {
        configuration, enqueue, now, createToken: () => 'C'.repeat(43)
      }),
      requestPasswordReset(user.email, {
        configuration, enqueue, now, createToken: () => 'D'.repeat(43)
      })
    ]);

    expect(results).toEqual([{ accepted: true }, { accepted: true }]);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(await PasswordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('rejects expired tokens and prevents replay', async () => {
    const user = await createUser();
    const expiredToken = 'E'.repeat(43);
    const issuedAt = new Date('2026-09-02T10:00:00Z');
    await requestWithToken(user, expiredToken, { now: issuedAt });

    await expect(confirmPasswordReset({
      token: expiredToken,
      password: 'replacement-password',
      passwordRepeat: 'replacement-password'
    }, { now: new Date('2026-09-02T10:31:00Z'), hashPassword: vi.fn() }))
      .rejects.toMatchObject({ code: 'PASSWORD_RESET_INVALID' });

    const liveToken = 'F'.repeat(43);
    await requestWithToken(user, liveToken, { now: new Date() });
    const input = {
      token: liveToken,
      password: 'replacement-password',
      passwordRepeat: 'replacement-password'
    };
    await expect(confirmPasswordReset(input)).resolves.toEqual({ reset: true });
    await expect(confirmPasswordReset(input)).rejects.toMatchObject({
      code: 'PASSWORD_RESET_INVALID'
    });
  });

  it('hashes the new password, rotates Fever credentials, and records the session boundary', async () => {
    const user = await createUser();
    const oldFeverHash = user.feverCredentialHash;
    const rawToken = 'G'.repeat(43);
    const now = new Date();
    const newPassword = 'replacement-password';
    await requestWithToken(user, rawToken, { now });

    await confirmPasswordReset({
      token: rawToken,
      password: newPassword,
      passwordRepeat: newPassword
    }, { now });

    await user.reload();
    expect(await bcrypt.compare(newPassword, user.password)).toBe(true);
    expect(user.feverCredentialHash).not.toBe(oldFeverHash);
    expect(user.feverCredentialHash).toBe(createFeverCredentialHash(
      createFeverApiKey(user.username, newPassword)
    ));
    expect(Math.floor(user.passwordChangedAt.getTime() / 1000))
      .toBe(Math.floor(now.getTime() / 1000));
  });

  it('allows only one concurrent confirmation to consume a token', async () => {
    const user = await createUser();
    const rawToken = 'J'.repeat(43);
    await requestWithToken(user, rawToken, { now: new Date() });
    const input = {
      token: rawToken,
      password: 'replacement-password',
      passwordRepeat: 'replacement-password'
    };

    const results = await Promise.allSettled([
      confirmPasswordReset(input),
      confirmPasswordReset(input)
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected.reason).toMatchObject({ code: 'PASSWORD_RESET_INVALID' });
  });
});
