import { encryptSecret, decryptSecret } from '../secretEncryption.js';
import db from '../../models/index.js';
import {
  EmailConfigurationError, getEmailConfiguration as parseConfiguration,
  getEmailConfigurationStatus as configurationStatus, isEmailEnabled as parseEnabled
} from '../../config/email.js';

const KEY = 'emailConfiguration';
const BOOLEAN_FIELDS = ['EMAIL_ENABLED', 'SMTP_SECURE', 'SMTP_REQUIRE_TLS'];
const STRING_FIELDS = ['PUBLIC_APP_URL', 'SMTP_HOST', 'SMTP_USER', 'EMAIL_FROM', 'EMAIL_REPLY_TO'];
const FIELDS = [...BOOLEAN_FIELDS, ...STRING_FIELDS, 'SMTP_PORT'];
const readOverrides = async (options = {}) =>
  (await db.ServerSetting.findByPk(KEY, { ...options, logging: false }))?.value || {};
const merge = (overrides, environment = process.env) => ({
  ...environment, ...overrides,
  // A managed SMTP group must never inherit deployment credentials or password files.
  ...(Object.hasOwn(overrides, 'EMAIL_ENABLED') ? { SMTP_PASSWORD: overrides.SMTP_PASSWORD ?? '', SMTP_PASSWORD_FILE: '' } : {})
});

const resolveConfiguration = overrides => {
  const environment = merge(overrides);
  if (parseEnabled(environment) && Object.hasOwn(overrides, 'SMTP_PASSWORD')) environment.SMTP_PASSWORD = decryptSecret(overrides.SMTP_PASSWORD);
  return parseConfiguration(environment);
};
export const getEmailConfiguration = async ({ transaction } = {}) =>
  resolveConfiguration(await readOverrides({ transaction }));
export const isEmailEnabled = async () => parseEnabled(merge(await readOverrides()));
export const getEmailConfigurationStatus = async () => configurationStatus(merge(await readOverrides()));

// Passwords are never included in metadata, even when they come from the environment.
export const getEmailSettings = async () => {
  const overrides = await readOverrides();
  const environment = merge(overrides);
  const port = Number(environment.SMTP_PORT || 587);
  const defaults = { EMAIL_ENABLED: false, SMTP_PORT: 587, SMTP_SECURE: port === 465, SMTP_REQUIRE_TLS: port === 587 };
  const fields = Object.fromEntries(FIELDS.map(key => {
    const raw = environment[key];
    const value = raw === undefined || raw === '' ? defaults[key] ?? ''
      : BOOLEAN_FIELDS.includes(key) ? String(raw).trim().toLowerCase() === 'true'
        : key === 'SMTP_PORT' ? Number(raw) : raw;
    return [key, { value, overridden: key === 'EMAIL_ENABLED' ? Object.keys(overrides).length > 0 : Object.hasOwn(overrides, key) }];
  }));
  return {
    fields,
    password: { configured: Boolean(environment.SMTP_PASSWORD), overridden: Object.hasOwn(overrides, 'SMTP_PASSWORD') },
    ...configurationStatus(environment)
  };
};

const validateInput = input => {
  if (!input || !input.overrides || typeof input.overrides !== 'object' || Array.isArray(input.overrides) ||
      Object.keys(input).some(key => !['overrides', 'passwordAction', 'password'].includes(key))) {
    throw new EmailConfigurationError('Provide SMTP overrides and a password action');
  }
  if (!['keep', 'replace', 'clear', 'environment'].includes(input.passwordAction)) {
    throw new EmailConfigurationError('Choose whether to keep, replace, clear, or restore the environment password');
  }
  if (input.passwordAction === 'replace') {
    if (typeof input.password !== 'string' || !input.password || input.password.length > 4096) {
      throw new EmailConfigurationError('Enter an SMTP password of at most 4096 characters');
    }
  } else if (Object.hasOwn(input, 'password')) throw new EmailConfigurationError('Only a replacement may include a password');
  const managed = Object.hasOwn(input.overrides, 'EMAIL_ENABLED');
  if (!managed && (Object.keys(input.overrides).length || ['replace', 'clear'].includes(input.passwordAction))) {
    throw new EmailConfigurationError('SMTP options require the EMAIL_ENABLED override');
  }
  if (managed && input.passwordAction === 'environment') {
    throw new EmailConfigurationError('Restore all environment defaults to use the environment password');
  }
  if (managed && FIELDS.some(key => !Object.hasOwn(input.overrides, key))) {
    throw new EmailConfigurationError('Provide all SMTP options with the EMAIL_ENABLED override');
  }
  for (const [key, value] of Object.entries(input.overrides)) {
    if (!FIELDS.includes(key)) throw new EmailConfigurationError('Unknown SMTP setting');
    if (BOOLEAN_FIELDS.includes(key) && typeof value !== 'boolean') throw new EmailConfigurationError(`${key} must be true or false`);
    if (key === 'SMTP_PORT' && (!Number.isInteger(value) || value < 1 || value > 65535)) {
      throw new EmailConfigurationError('SMTP_PORT must be an integer between 1 and 65535');
    }
    if (STRING_FIELDS.includes(key) && (typeof value !== 'string' || value.length > 2048 || /[\r\n\0]/.test(value))) {
      throw new EmailConfigurationError(`${key} must be a single-line string of at most 2048 characters`);
    }
  }
};

export const saveEmailSettings = async input => {
  validateInput(input);
  // Lock the aggregate row so keeping a password cannot restore an older concurrent value.
  await db.sequelize.transaction({ logging: false }, async transaction => {
    await db.ServerSetting.findOrCreate({ where: { key: KEY }, defaults: { value: {} }, transaction, logging: false });
    const row = await db.ServerSetting.findByPk(KEY, { transaction, lock: transaction.LOCK.UPDATE, logging: false });
    const overrides = { ...input.overrides };
    if (Object.hasOwn(overrides, 'EMAIL_ENABLED')) overrides.SMTP_PASSWORD = input.passwordAction === 'keep' ? row.value.SMTP_PASSWORD ?? '' : '';
    if (input.passwordAction === 'replace') overrides.SMTP_PASSWORD = input.password;
    if (input.passwordAction === 'clear') overrides.SMTP_PASSWORD = '';
    // Only retained database values may already be encrypted; replacement input is always plaintext.
    if (input.passwordAction === 'keep' && overrides.SMTP_PASSWORD) overrides.SMTP_PASSWORD = decryptSecret(overrides.SMTP_PASSWORD);
    parseConfiguration(merge(overrides));
    if (overrides.SMTP_PASSWORD) overrides.SMTP_PASSWORD = encryptSecret(overrides.SMTP_PASSWORD);
    await row.update({ value: overrides }, { transaction, logging: false });
  });
  return getEmailSettings();
};

export const clearEmailSettings = async () => {
  await db.ServerSetting.destroy({ where: { key: KEY }, logging: false });
  return getEmailSettings();
};
