import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import db from '../models/index.js';
import { getEmailConfigurationStatus } from '../config/email.js';
import { changeUserEmail } from './email/emailVerification.js';
import { enqueueDailyBriefingEmail } from './dailyBriefing/dailyBriefingEmail.service.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../utils/apiCredentials.js';

const { BriefingPreference, PasswordResetToken, User, sequelize } = db;
const EMAIL_DIGEST_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class AccountSettingsError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AccountSettingsError';
    this.code = code;
    this.status = status;
  }
}

const getServerTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const validateBoolean = (value, name) => {
  if (typeof value !== 'boolean') {
    throw new AccountSettingsError(
      'ACCOUNT_SETTINGS_INVALID',
      `${name} must be true or false.`
    );
  }
  return value;
};

const validateDigestTime = value => {
  if (!EMAIL_DIGEST_TIME_PATTERN.test(String(value || ''))) {
    throw new AccountSettingsError(
      'EMAIL_DIGEST_TIME_INVALID',
      'Daily briefing time must use 24-hour HH:mm format.'
    );
  }
  return value;
};

const validateDigestTimezone = value => {
  const timezone = typeof value === 'string' ? value.trim() : '';
  if (!timezone || timezone.length > 64) {
    throw new AccountSettingsError(
      'EMAIL_DIGEST_TIMEZONE_INVALID',
      'Daily briefing timezone must be a valid IANA timezone.'
    );
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new AccountSettingsError(
      'EMAIL_DIGEST_TIMEZONE_INVALID',
      'Daily briefing timezone must be a valid IANA timezone.'
    );
  }
  return timezone;
};

const validatePassword = (password, passwordRepeat) => {
  const hasPassword = typeof password === 'string' && password.length > 0;
  const hasRepeat = typeof passwordRepeat === 'string' && passwordRepeat.length > 0;
  if (!hasPassword && !hasRepeat) return null;
  if (!hasPassword || password.length < 8 || password.length > 128) {
    throw new AccountSettingsError(
      'PASSWORD_INVALID',
      'Password must be between 8 and 128 characters.'
    );
  }
  if (password !== passwordRepeat) {
    throw new AccountSettingsError('PASSWORD_MISMATCH', 'Passwords do not match.');
  }
  return password;
};

const emailServiceIsAvailable = () => {
  const status = getEmailConfigurationStatus();
  return status.enabled && status.configured;
};

const hasCustomizedDigestSettings = preference => Boolean(preference && (
  preference.emailDigestEnabled ||
  preference.emailDigestTime !== '08:00' ||
  preference.emailDigestTimezone !== 'UTC' ||
  preference.emailDigestSkipWhenEmpty === false
));

const serializeAccountSettings = (user, preference, { passwordChanged = false } = {}) => ({
  username: user.username,
  email: user.email,
  emailVerifiedAt: user.emailVerifiedAt,
  emailServiceEnabled: emailServiceIsAvailable(),
  serverTimezone: getServerTimezone(),
  emailDigestConfigured: hasCustomizedDigestSettings(preference),
  emailDigestEnabled: Boolean(preference?.emailDigestEnabled),
  emailDigestTime: preference?.emailDigestTime || '08:00',
  emailDigestTimezone: preference?.emailDigestTimezone || getServerTimezone(),
  emailDigestSkipWhenEmpty: preference
    ? Boolean(preference.emailDigestSkipWhenEmpty)
    : true,
  passwordChanged
});

export const getAccountSettings = async userId => {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'username', 'email', 'emailVerifiedAt']
  });
  if (!user) throw new AccountSettingsError('USER_NOT_FOUND', 'Account not found.', 404);
  const preference = await BriefingPreference.findOne({ where: { userId } });
  return serializeAccountSettings(user, preference);
};

export const updateAccountSettings = async (userId, values, { now = new Date() } = {}) => {
  const emailDigestEnabled = validateBoolean(
    values.emailDigestEnabled,
    'emailDigestEnabled'
  );
  const emailDigestSkipWhenEmpty = validateBoolean(
    values.emailDigestSkipWhenEmpty,
    'emailDigestSkipWhenEmpty'
  );
  const emailDigestTime = validateDigestTime(values.emailDigestTime);
  const emailDigestTimezone = validateDigestTimezone(values.emailDigestTimezone);
  const password = validatePassword(values.password, values.passwordRepeat);
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  return sequelize.transaction(async transaction => {
    const existingUser = await User.findByPk(userId, {
      attributes: ['id', 'email'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!existingUser) {
      throw new AccountSettingsError('USER_NOT_FOUND', 'Account not found.', 404);
    }

    const previousEmail = existingUser.email;
    await changeUserEmail(userId, values.email, {
      allowNull: !emailServiceIsAvailable(),
      now,
      transaction
    });
    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    const emailChanged = previousEmail !== user.email;
    let effectiveDigestEnabled = emailDigestEnabled;

    if (effectiveDigestEnabled && !emailServiceIsAvailable()) {
      throw new AccountSettingsError(
        'EMAIL_DISABLED',
        'Email delivery is not enabled on this server.',
        409
      );
    }
    if (effectiveDigestEnabled && !user.emailVerifiedAt) {
      if (emailChanged) {
        effectiveDigestEnabled = false;
      } else {
        throw new AccountSettingsError(
          'EMAIL_NOT_VERIFIED',
          'Verify your email address before enabling daily briefings.',
          409
        );
      }
    }

    const [preference] = await BriefingPreference.upsert({
      userId,
      emailDigestEnabled: effectiveDigestEnabled,
      emailDigestTime,
      emailDigestTimezone,
      emailDigestSkipWhenEmpty
    }, { transaction });

    if (password) {
      const feverApiKey = createFeverApiKey(user.username, password);
      await user.update({
        password: passwordHash,
        feverCredentialHash: createFeverCredentialHash(feverApiKey),
        passwordChangedAt: now
      }, { transaction });
      await PasswordResetToken.update({ usedAt: now }, {
        where: { userId, usedAt: { [Op.is]: null } },
        transaction
      });
    }

    return serializeAccountSettings(user, preference, { passwordChanged: Boolean(password) });
  });
};

export const enqueueDailyBriefingTest = async (userId, {
  enqueueDigest = enqueueDailyBriefingEmail,
  createDedupeKey = () => `daily-digest-test:${randomUUID()}`
} = {}) => {
  if (!emailServiceIsAvailable()) {
    throw new AccountSettingsError(
      'EMAIL_DISABLED',
      'Email delivery is not enabled on this server.',
      409
    );
  }

  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'emailVerifiedAt']
  });
  if (!user) throw new AccountSettingsError('USER_NOT_FOUND', 'Account not found.', 404);
  if (!user.email || !user.emailVerifiedAt) {
    throw new AccountSettingsError(
      'EMAIL_NOT_VERIFIED',
      'Verify your email address before sending a daily briefing test.',
      409
    );
  }

  const result = await enqueueDigest(user, {
    testMode: true,
    forceWhenEmpty: true,
    createTestDedupeKey: createDedupeKey
  });
  return result;
};
