import { createHash, randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { getEmailConfiguration, normalizeEmailAddress } from '../../config/email.js';

const { EmailVerificationToken, User, sequelize } = db;
const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class EmailVerificationError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'EmailVerificationError';
    this.code = code;
    this.status = status;
  }
}

const hashToken = token => createHash('sha256').update(token).digest('hex');

const normalizeToken = token => {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(normalized)) {
    throw new EmailVerificationError(
      'EMAIL_VERIFICATION_INVALID',
      'This verification link is invalid or has expired.'
    );
  }
  return normalized;
};

const requireEnabledConfiguration = configuration => {
  if (!configuration.enabled) {
    throw new EmailVerificationError(
      'EMAIL_DISABLED',
      'Email delivery is not enabled on this server.',
      503
    );
  }
  return configuration;
};

// Changes only the signed-in user's address and invalidates credentials for the old address.
export const changeUserEmail = async (userId, email, {
  allowNull = false,
  now = new Date(),
  transaction = null
} = {}) => {
  const normalizedEmail = allowNull && !String(email || '').trim()
    ? null
    : normalizeEmailAddress(email);

  try {
    const changeEmail = async activeTransaction => {
      const user = await User.findByPk(userId, {
        transaction: activeTransaction,
        lock: activeTransaction.LOCK.UPDATE
      });
      if (!user) {
        throw new EmailVerificationError('USER_NOT_FOUND', 'Account not found.', 404);
      }

      if (user.email === normalizedEmail) {
        return { email: user.email, emailVerifiedAt: user.emailVerifiedAt };
      }

      await user.update(
        { email: normalizedEmail, emailVerifiedAt: null },
        { transaction: activeTransaction }
      );
      await EmailVerificationToken.update({ usedAt: now }, {
        where: { userId: user.id, usedAt: { [Op.is]: null } },
        transaction: activeTransaction
      });
      return { email: user.email, emailVerifiedAt: null };
    };

    return transaction
      ? await changeEmail(transaction)
      : await sequelize.transaction(changeEmail);
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      throw new EmailVerificationError(
        'EMAIL_ALREADY_IN_USE',
        'This email address is already in use.',
        409
      );
    }
    throw error;
  }
};

// Creates and queues a new verification credential, superseding every older unused credential.
export const requestUserEmailVerification = async (userId, {
  configuration = getEmailConfiguration(),
  enqueue = null,
  now = new Date(),
  createToken = () => randomBytes(TOKEN_BYTES).toString('base64url')
} = {}) => {
  const emailConfiguration = requireEnabledConfiguration(configuration);
  const enqueueOperation = enqueue || (await import('./emailService.js')).enqueueEmail;
  const token = createToken();
  const tokenHash = hashToken(normalizeToken(token));
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await sequelize.transaction(async transaction => {
    const user = await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user) {
      throw new EmailVerificationError('USER_NOT_FOUND', 'Account not found.', 404);
    }
    if (!user.email) {
      throw new EmailVerificationError(
        'EMAIL_REQUIRED',
        'Add an email address before requesting verification.'
      );
    }
    if (user.emailVerifiedAt) return;

    await EmailVerificationToken.update({ usedAt: now }, {
      where: { userId: user.id, usedAt: { [Op.is]: null } },
      transaction
    });
    const verificationToken = await EmailVerificationToken.create({
      userId: user.id,
      tokenHash,
      expiresAt
    }, { transaction });
    const actionUrl = new URL(emailConfiguration.publicAppUrl);
    actionUrl.hash = new URLSearchParams({ 'verify-email-token': token }).toString();

    await enqueueOperation({
      userId: user.id,
      recipient: user.email,
      dedupeKey: `email-verification:${verificationToken.id}`,
      templateType: 'email_verification',
      templateData: { actionUrl: actionUrl.toString() }
    }, { transaction });
  });

  return { requested: true };
};

// Consumes a live credential exactly once and verifies only its owning user's current address.
export const confirmUserEmailVerification = async (rawToken, { now = new Date() } = {}) => {
  const tokenHash = hashToken(normalizeToken(rawToken));

  return sequelize.transaction(async transaction => {
    const token = await EmailVerificationToken.findOne({
      where: { tokenHash },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!token || token.usedAt || token.expiresAt <= now) {
      throw new EmailVerificationError(
        'EMAIL_VERIFICATION_INVALID',
        'This verification link is invalid or has expired.'
      );
    }

    const user = await User.findByPk(token.userId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!user?.email) {
      throw new EmailVerificationError(
        'EMAIL_VERIFICATION_INVALID',
        'This verification link is invalid or has expired.'
      );
    }

    await token.update({ usedAt: now }, { transaction });
    await user.update({ emailVerifiedAt: now }, { transaction });
    return { verified: true };
  });
};

export const getUserEmailSettings = async userId => {
  const user = await User.findByPk(userId, {
    attributes: ['email', 'emailVerifiedAt']
  });
  if (!user) throw new EmailVerificationError('USER_NOT_FOUND', 'Account not found.', 404);
  return { email: user.email, emailVerifiedAt: user.emailVerifiedAt };
};
