import { encryptSecret, decryptSecret } from '../secretEncryption.js';
import db from '../../models/index.js';
import { AuthConfigurationError, validateAuthConfiguration, isLocalAuthEnabled as parseLocalEnabled } from '../../config/auth.js';

const KEY = 'authConfiguration';
const PROVIDER_FIELDS = ['OIDC_AUTO_PROVISION', 'OIDC_ISSUER_URL', 'OIDC_REDIRECT_URI', 'OIDC_FRONTEND_URL', 'OIDC_SCOPES'];
const FLAGS = ['OIDC_ENABLED', 'LOCAL_AUTH_ENABLED'];
const readOverrides = async () => (await db.ServerSetting.findByPk(KEY, { logging: false }))?.value || {};
const SECRET_FIELDS = ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'];
const resolveConfiguration = overrides => {
  const environment = { ...process.env, ...overrides };
  const configuration = validateAuthConfiguration(environment);
  if (!configuration.oidcEnabled) return configuration;
  for (const key of SECRET_FIELDS) if (Object.hasOwn(overrides, key)) environment[key] = decryptSecret(overrides[key]);
  return validateAuthConfiguration(environment);
};
export const getAuthConfiguration = async () => resolveConfiguration(await readOverrides());
export const isLocalAuthEnabled = async () => parseLocalEnabled({ ...process.env, ...await readOverrides() });

export const getAuthSettings = async () => {
  const overrides = await readOverrides();
  const environment = { ...process.env, ...overrides };
  const defaults = { OIDC_ENABLED: false, LOCAL_AUTH_ENABLED: true, OIDC_AUTO_PROVISION: false, OIDC_SCOPES: 'openid profile email' };
  return {
    fields: { ...Object.fromEntries([...FLAGS, ...PROVIDER_FIELDS].map(key => [key, {
      value: [...FLAGS, 'OIDC_AUTO_PROVISION'].includes(key)
        ? (String(environment[key] ?? '').trim() || String(defaults[key])).toLowerCase() === 'true'
        : environment[key] ?? defaults[key] ?? '',
      overridden: Object.hasOwn(overrides, key)
    }])), OIDC_CLIENT_ID: { configured: Boolean(environment.OIDC_CLIENT_ID), overridden: Object.hasOwn(overrides, 'OIDC_CLIENT_ID') } },
    secret: { configured: Boolean(environment.OIDC_CLIENT_SECRET), overridden: Object.hasOwn(overrides, 'OIDC_CLIENT_SECRET') }
  };
};

export const saveAuthSettings = async input => {
  const invalid = message => { throw new AuthConfigurationError(message); };
  if (!input || !input.overrides || typeof input.overrides !== 'object' || Array.isArray(input.overrides) ||
      Object.keys(input).some(key => !['overrides', 'secretAction', 'secret'].includes(key))) invalid('Provide authentication overrides and a secret action');
  if (!['keep', 'replace', 'environment'].includes(input.secretAction)) invalid('Choose whether to keep, replace, or restore the environment secret');
  if (input.secretAction === 'replace') {
    if (typeof input.secret !== 'string' || !input.secret.trim() || input.secret.length > 4096) invalid('Enter a client secret of at most 4096 characters');
  } else if (Object.hasOwn(input, 'secret')) invalid('Only a replacement may include a client secret');
  const managed = Object.hasOwn(input.overrides, 'OIDC_ENABLED');
  if (!managed && ([...PROVIDER_FIELDS, 'OIDC_CLIENT_ID'].some(key => Object.hasOwn(input.overrides, key)) || input.secretAction === 'replace')) invalid('Provider fields require the OIDC override');
  if (managed && PROVIDER_FIELDS.some(key => !Object.hasOwn(input.overrides, key))) invalid('Provide all provider fields with the OIDC override');
  for (const [key, value] of Object.entries(input.overrides)) {
    if (![...FLAGS, ...PROVIDER_FIELDS, 'OIDC_CLIENT_ID'].includes(key)) invalid('Unknown authentication setting');
    if ([...FLAGS, 'OIDC_AUTO_PROVISION'].includes(key)) {
      if (typeof value !== 'boolean') invalid(`${key} must be true or false`);
    } else if (typeof value !== 'string' || value.length > 2048 || /[\r\n\0]/.test(value)) invalid(`${key} must be a single-line string of at most 2048 characters`);
  }
  // Serialize saves so retaining a secret never restores a stale concurrent value.
  await db.sequelize.transaction({ logging: false }, async transaction => {
    await db.ServerSetting.findOrCreate({ where: { key: KEY }, defaults: { value: {} }, transaction, logging: false });
    const row = await db.ServerSetting.findByPk(KEY, { transaction, lock: transaction.LOCK.UPDATE, logging: false });
    const overrides = { ...input.overrides };
    if (managed && !Object.hasOwn(overrides, 'OIDC_CLIENT_ID') && Object.hasOwn(row.value, 'OIDC_CLIENT_ID')) overrides.OIDC_CLIENT_ID = decryptSecret(row.value.OIDC_CLIENT_ID);
    if (managed && input.secretAction === 'keep' && Object.hasOwn(row.value, 'OIDC_CLIENT_SECRET')) overrides.OIDC_CLIENT_SECRET = decryptSecret(row.value.OIDC_CLIENT_SECRET);
    if (managed && input.secretAction === 'replace') overrides.OIDC_CLIENT_SECRET = input.secret;
    validateAuthConfiguration({ ...process.env, ...overrides });
    for (const key of SECRET_FIELDS) if (overrides[key]) overrides[key] = encryptSecret(overrides[key]);
    await row.update({ value: overrides }, { transaction, logging: false });
  });
  return getAuthSettings();
};

export const clearAuthSettings = () => saveAuthSettings({ overrides: {}, secretAction: 'environment' });

// Keep model serialization synchronous while resolving server policy once per response.
export const serializeAuthUser = async user => user.toJSON({ localAuthEnabled: await isLocalAuthEnabled() });
