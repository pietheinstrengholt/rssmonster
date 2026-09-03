import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { getEmailConfiguration, normalizeEmailAddress } from '../../config/email.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../../utils/apiCredentials.js';

const { PasswordResetToken, User, sequelize } = db;
const TOKEN_BYTES = 32;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_ACCOUNT_COOLDOWN_MS = 15 * 60 * 1000;

export class PasswordResetError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PasswordResetError';
    this.code = code;
    this.status = status;
  }
}

const hashToken = token => createHash('sha256').update(token).digest('hex');

const normalizeToken = token => {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(normalized)) {
    throw new PasswordResetError(
      'PASSWORD_RESET_INVALID',
      'This password reset link is invalid or has expired.'
    );
  }
  return normalized;
};

export const validateResetPassword = (password, passwordRepeat) => {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new PasswordResetError(
      'PASSWORD_INVALID',
      'Password must be between 8 and 128 characters.'
    );
  }
  if (password !== passwordRepeat) {
    throw new PasswordResetError('PASSWORD_MISMATCH', 'Passwords do not match.');
  }
  return password;
};

// Quietly queues one reset for a verified account while preserving enumeration resistance.
export const requestPasswordReset = async (email, {
  configuration = getEmailConfiguration(),
  enqueue = null,
  now = new Date(),
  createToken = () => randomBytes(TOKEN_BYTES).toString('base64url'),
  cooldownMs = PASSWORD_RESET_ACCOUNT_COOLDOWN_MS
} = {}) => {
  if (!configuration.enabled) return { accepted: true };

  let normalizedEmail;
  try {
    normalizedEmail = normalizeEmailAddress(email);
  } catch {
    return { accepted: true };
  }

  const enqueueOperation = enqueue || (await import('./emailService.js')).enqueueEmail;
  await sequelize.transaction(async transaction => {
    const user = await User.findOne({
      where: { email: normalizedEmail, emailVerifiedAt: { [Op.ne]: null } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user) return;

    if (cooldownMs > 0) {
      const cooldownStart = new Date(now.getTime() - cooldownMs);
      const recentToken = await PasswordResetToken.findOne({
        where: {
          userId: user.id,
          createdAt: { [Op.gte]: cooldownStart }
        },
        attributes: ['id'],
        transaction
      });
      if (recentToken) return;
    }

    await PasswordResetToken.update({ usedAt: now }, {
      where: { userId: user.id, usedAt: { [Op.is]: null } },
      transaction
    });
    const rawToken = normalizeToken(createToken());
    const resetToken = await PasswordResetToken.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS)
    }, { transaction });
    const actionUrl = new URL(configuration.publicAppUrl);
    actionUrl.hash = new URLSearchParams({ 'reset-password-token': rawToken }).toString();

    await enqueueOperation({
      userId: user.id,
      recipient: user.email,
      dedupeKey: `password-reset:${resetToken.id}`,
      templateType: 'password_reset',
      templateData: { actionUrl: actionUrl.toString() }
    }, { transaction });
  });

  return { accepted: true };
};

// Atomically consumes one reset credential, rotates both password derivatives, and ends old sessions.
export const confirmPasswordReset = async ({ token, password, passwordRepeat }, {
  now = new Date(),
  hashPassword = value => bcrypt.hash(value, 10)
} = {}) => {
  const rawToken = normalizeToken(token);
  const validatedPassword = validateResetPassword(password, passwordRepeat);
  const passwordHash = await hashPassword(validatedPassword);
  const tokenHash = hashToken(rawToken);

  return sequelize.transaction(async transaction => {
    const resetToken = await PasswordResetToken.findOne({
      where: { tokenHash },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
      throw new PasswordResetError(
        'PASSWORD_RESET_INVALID',
        'This password reset link is invalid or has expired.'
      );
    }

    const user = await User.findByPk(resetToken.userId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user) {
      throw new PasswordResetError(
        'PASSWORD_RESET_INVALID',
        'This password reset link is invalid or has expired.'
      );
    }

    const feverApiKey = createFeverApiKey(user.username, validatedPassword);
    await user.update({
      password: passwordHash,
      feverCredentialHash: createFeverCredentialHash(feverApiKey),
      passwordChangedAt: now
    }, { transaction });
    await PasswordResetToken.update({ usedAt: now }, {
      where: { userId: user.id, usedAt: { [Op.is]: null } },
      transaction
    });
    return { reset: true };
  });
};
