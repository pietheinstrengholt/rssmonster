import { createECDH } from 'node:crypto';
import db from '../../models/index.js';
import { encryptSecret, decryptSecret } from '../secretEncryption.js';

const KEY = 'pushConfiguration';
const KEY_FIELDS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
const readOverrides = async () => (await db.ServerSetting.findByPk(KEY, { logging: false }))?.value || null;
const configured = values => Boolean(values.VAPID_PUBLIC_KEY?.trim() && values.VAPID_PRIVATE_KEY?.trim() && values.VAPID_SUBJECT?.trim());

export class PushConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PushConfigurationError';
    this.code = 'PUSH_CONFIGURATION_INVALID';
  }
}

export const getPushConfiguration = async ({ publicOnly = false } = {}) => {
  const overrides = await readOverrides();
  const values = overrides || process.env;
  if (!configured(values)) return { enabled: false, publicKey: null, privateKey: null, subject: null };
  const resolve = key => (overrides ? decryptSecret(values[key]) : values[key]).trim();
  return {
    enabled: true,
    publicKey: resolve('VAPID_PUBLIC_KEY'),
    privateKey: publicOnly ? null : resolve('VAPID_PRIVATE_KEY'),
    subject: values.VAPID_SUBJECT.trim()
  };
};

export const getPushSettings = async () => {
  const overrides = await readOverrides();
  const values = overrides || process.env;
  return {
    overridden: Boolean(overrides),
    configured: configured(values),
    fields: {
      ...Object.fromEntries(KEY_FIELDS.map(key => [key, { configured: Boolean(values[key]?.trim()), overridden: Boolean(overrides) }])),
      VAPID_SUBJECT: { value: values.VAPID_SUBJECT || '', overridden: Boolean(overrides) }
    }
  };
};

const validateConfiguration = values => {
  const subject = values.VAPID_SUBJECT;
  if (subject) {
    try {
      const url = new URL(subject);
      if (!['mailto:', 'https:'].includes(url.protocol) || url.username || url.password ||
          (url.protocol === 'mailto:' && !/^[^\s@]+@[^\s@]+$/.test(url.pathname))) throw new Error();
    } catch { throw new PushConfigurationError('VAPID_SUBJECT must be an HTTPS URL or mailto: email address'); }
  }
  const publicKey = values.VAPID_PUBLIC_KEY;
  const privateKey = values.VAPID_PRIVATE_KEY;
  if (!publicKey && !privateKey) return;
  if (!publicKey || !privateKey || !subject) throw new PushConfigurationError('Provide both VAPID keys and a subject, or clear both keys to disable Web Push');
  try {
    const decode = (value, length) => {
      const bytes = Buffer.from(value, 'base64url');
      if (!/^[A-Za-z0-9_-]+$/.test(value) || bytes.length !== length || bytes.toString('base64url') !== value) throw new Error();
      return bytes;
    };
    const publicBytes = decode(publicKey, 65);
    const curve = createECDH('prime256v1');
    curve.setPrivateKey(decode(privateKey, 32));
    if (!curve.getPublicKey().equals(publicBytes)) throw new Error();
  } catch { throw new PushConfigurationError('VAPID keys must be a matching P-256 key pair encoded as unpadded Base64url'); }
};

export const savePushSettings = async input => {
  if (!input || typeof input.overridden !== 'boolean' || Object.keys(input).some(key => !['overridden', 'subject', 'publicKey', 'privateKey'].includes(key))) {
    throw new PushConfigurationError('Provide the Web Push override and its configuration');
  }
  if (!input.overridden) {
    if (Object.keys(input).length !== 1) throw new PushConfigurationError('Inherited Web Push settings cannot include overrides');
    return clearPushSettings();
  }
  if (typeof input.subject !== 'string' || input.subject.length > 2048 || /[\r\n\0]/.test(input.subject)) throw new PushConfigurationError('Provide a single-line VAPID subject of at most 2048 characters');
  for (const key of ['publicKey', 'privateKey']) {
    if (Object.hasOwn(input, key) && (typeof input[key] !== 'string' || input[key].length > 2048 || /[\r\n\0]/.test(input[key]))) throw new PushConfigurationError('VAPID keys must be single-line strings of at most 2048 characters');
  }
  await db.sequelize.transaction({ logging: false }, async transaction => {
    await db.ServerSetting.findOrCreate({ where: { key: KEY }, defaults: { value: {} }, transaction, logging: false });
    const row = await db.ServerSetting.findByPk(KEY, { transaction, lock: transaction.LOCK.UPDATE, logging: false });
    const values = { VAPID_SUBJECT: input.subject.trim() };
    for (const [field, key] of [['VAPID_PUBLIC_KEY', 'publicKey'], ['VAPID_PRIVATE_KEY', 'privateKey']]) {
      values[field] = Object.hasOwn(input, key) ? input[key].trim() : decryptSecret(row.value[field] || '');
    }
    validateConfiguration(values);
    for (const key of KEY_FIELDS) if (values[key]) values[key] = encryptSecret(values[key]);
    await row.update({ value: values }, { transaction, logging: false });
  });
  return getPushSettings();
};

export const clearPushSettings = async () => {
  await db.ServerSetting.destroy({ where: { key: KEY }, logging: false });
  return getPushSettings();
};
