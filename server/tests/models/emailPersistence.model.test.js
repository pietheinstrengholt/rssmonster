import { beforeAll, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { EMAIL_DELIVERY_STATUSES } from '../../models/emailDelivery.js';

const {
  sequelize,
  User,
  EmailVerificationToken,
  PasswordResetToken,
  EmailDelivery
} = db;

const uniqueValue = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Creates one persisted user with optional email identity for cross-dialect tests.
const createUser = (prefix, email = null) => {
  const username = uniqueValue(prefix);
  return User.create({
    username,
    email,
    password: 'stored-password',
    feverCredentialHash: `${username}-fever-hash`,
    role: 'user'
  });
};

describe('email persistence models', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  });

  it('keeps email identity optional for existing users', async () => {
    const firstUser = await createUser('email-optional-first');
    const secondUser = await createUser('email-optional-second');

    expect(firstUser).toMatchObject({
      email: null,
      emailVerifiedAt: null,
      passwordChangedAt: null
    });
    expect(secondUser.email).toBeNull();
  });

  it('enforces a unique non-null email address', async () => {
    const email = `${uniqueValue('unique')}@example.com`;
    await createUser('email-owner', email);

    await expect(createUser('email-conflict', email)).rejects.toMatchObject({
      name: 'SequelizeUniqueConstraintError'
    });
  });

  it('declares hashed, expiring, single-use token contracts', () => {
    for (const TokenModel of [EmailVerificationToken, PasswordResetToken]) {
      expect(TokenModel.rawAttributes.tokenHash).toMatchObject({ allowNull: false });
      expect(TokenModel.rawAttributes.tokenHash.type.options.length).toBe(64);
      expect(TokenModel.rawAttributes.expiresAt.allowNull).toBe(false);
      expect(TokenModel.rawAttributes.usedAt).toMatchObject({
        allowNull: true,
        defaultValue: null
      });
      expect(TokenModel.rawAttributes).not.toHaveProperty('token');
    }
  });

  it('persists token ownership without serializing token hashes', async () => {
    const user = await createUser('email-token-owner');
    const expiresAt = new Date(Date.now() + 60_000);
    const verificationToken = await EmailVerificationToken.create({
      userId: user.id,
      tokenHash: 'a'.repeat(64),
      expiresAt
    });
    const resetToken = await PasswordResetToken.create({
      userId: user.id,
      tokenHash: 'b'.repeat(64),
      expiresAt
    });

    expect(verificationToken.toJSON()).not.toHaveProperty('tokenHash');
    expect(resetToken.toJSON()).not.toHaveProperty('tokenHash');
    expect(await verificationToken.getUser()).toMatchObject({ id: user.id });
    expect(await resetToken.getUser()).toMatchObject({ id: user.id });
    expect(await user.getEmailVerificationTokens()).toHaveLength(1);
    expect(await user.getPasswordResetTokens()).toHaveLength(1);
  });

  it('declares the durable delivery lifecycle and lookup indexes', () => {
    expect(EmailDelivery.rawAttributes.status.values).toEqual(EMAIL_DELIVERY_STATUSES);
    expect(EmailDelivery.rawAttributes.retryCount).toMatchObject({
      allowNull: false,
      defaultValue: 0
    });
    expect(EmailDelivery.rawAttributes.attemptCount.defaultValue).toBe(0);
    expect(EmailDelivery.rawAttributes.maxAttempts.defaultValue).toBe(5);
    expect(EmailDelivery.rawAttributes.payload.allowNull).toBe(false);
    expect(EmailDelivery.rawAttributes.scheduledAt.allowNull).toBe(false);
    expect(EmailDelivery.rawAttributes.availableAt.allowNull).toBe(false);
    expect(EmailDelivery.rawAttributes.leaseOwner.allowNull).toBe(true);
    expect(EmailDelivery.rawAttributes.leaseUntil.allowNull).toBe(true);
    expect(EmailDelivery.rawAttributes.completedAt.allowNull).toBe(true);
    expect(EmailDelivery.rawAttributes.providerMessageId.allowNull).toBe(true);
    expect(EmailDelivery.rawAttributes.lastError.allowNull).toBe(true);
    expect(EmailDelivery.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'email_deliveries_user_type_dedupe_unique',
        unique: true,
        fields: ['userId', 'messageType', 'dedupeKey']
      }),
      expect.objectContaining({
        name: 'email_deliveries_claim_idx',
        fields: ['status', 'availableAt', 'leaseUntil', 'id']
      })
    ]));
  });

  it('prevents duplicate daily delivery keys for one user', async () => {
    const user = await createUser('email-delivery-owner');
    const delivery = {
      userId: user.id,
      messageType: 'daily_digest',
      recipient: `${uniqueValue('recipient')}@example.com`,
      dedupeKey: '2026-09-02'
    };

    const firstDelivery = await EmailDelivery.create(delivery);

    await expect(EmailDelivery.create(delivery)).rejects.toMatchObject({
      name: 'SequelizeUniqueConstraintError'
    });
    expect(await firstDelivery.getUser()).toMatchObject({ id: user.id });
    expect(await user.getEmailDeliveries()).toHaveLength(1);
    expect(firstDelivery.toJSON()).not.toHaveProperty('payload');
  });

  it('cascades user deletion to tokens and deliveries', async () => {
    const user = await createUser('email-cascade-owner');
    const expiresAt = new Date(Date.now() + 60_000);
    const verificationToken = await EmailVerificationToken.create({
      userId: user.id,
      tokenHash: 'c'.repeat(64),
      expiresAt
    });
    const resetToken = await PasswordResetToken.create({
      userId: user.id,
      tokenHash: 'd'.repeat(64),
      expiresAt
    });
    const delivery = await EmailDelivery.create({
      userId: user.id,
      messageType: 'password_reset',
      recipient: `${uniqueValue('cascade')}@example.com`,
      dedupeKey: uniqueValue('reset')
    });

    await user.destroy();

    expect(await EmailVerificationToken.findByPk(verificationToken.id)).toBeNull();
    expect(await PasswordResetToken.findByPk(resetToken.id)).toBeNull();
    expect(await EmailDelivery.findByPk(delivery.id)).toBeNull();
  });
});
