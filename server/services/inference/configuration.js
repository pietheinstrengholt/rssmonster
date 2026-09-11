import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { validateHeaderValue } from 'node:http';
import { getFeverCredentialSecret } from '../../config/auth.js';

export class InferenceConfigurationError extends Error {
  constructor(message = 'Inference configuration could not be read', status = 400) {
    super(message); this.code = 'INFERENCE_CONFIGURATION_INVALID'; this.status = status;
  }
}
const encryptionKey = () => Buffer.from(hkdfSync('sha256', getFeverCredentialSecret(), '', 'rssmonster:inference-api-key:v1', 32));
const encrypt = value => {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
};
const decrypt = value => {
  if (!value) return null;
  try {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1') throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString('utf8');
  } catch { throw new InferenceConfigurationError('Stored inference credentials could not be read', 503); }
};
export const normalizeInferenceUrl = value => {
  try {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error();
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch { throw new InferenceConfigurationError('Enter an HTTP(S) endpoint without credentials, query parameters, or fragments'); }
};
export const getEnvironmentInferenceConfiguration = (environment = process.env) => {
  const baseUrl = environment.INFERENCE_BASE_URL?.trim() || environment.INFERENCE_URL?.trim();
  return baseUrl ? { source: 'environment', baseUrl, apiKey: environment.INFERENCE_API_KEY || null, configurable: false } : null;
};
const model = async () => (await import('../../models/index.js')).default.InferenceSetting;
export const getEffectiveInferenceConfiguration = async ({ environment = process.env } = {}) => {
  const configured = getEnvironmentInferenceConfiguration(environment);
  if (configured) return configured;
  const row = await (await model()).unscoped().findByPk(1);
  return row ? { source: 'database', baseUrl: row.baseUrl, apiKey: decrypt(row.apiKeyEncrypted), configurable: true }
    : { source: 'none', baseUrl: null, apiKey: null, configurable: true };
};
export const inferenceConfigurationIdentity = config => createHash('sha256')
  .update(JSON.stringify([config.source, config.baseUrl, config.apiKey])).digest('hex');
export const serializeInferenceConfiguration = config => {
  let baseUrl = null;
  try {
    const url = new URL(config.baseUrl);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    baseUrl = ['http:', 'https:'].includes(url.protocol) ? url.toString().replace(/\/+$/, '') : null;
  } catch { /* An invalid deployment URL is never reflected to the browser. */ }
  return { configurationSource: config.source, configurable: config.configurable, baseUrl, apiKeyConfigured: Boolean(config.apiKey) };
};
// Metadata remains readable if the encryption secret was rotated, so an admin can replace/remove the key.
export const getInferenceConfigurationMetadata = async () => {
  const environment = getEnvironmentInferenceConfiguration();
  if (environment) return serializeInferenceConfiguration(environment);
  const row = await (await model()).unscoped().findByPk(1);
  return serializeInferenceConfiguration({ source: row ? 'database' : 'none', configurable: true,
    baseUrl: row?.baseUrl ?? null, apiKey: Boolean(row?.apiKeyEncrypted) });
};
const assertConfigurable = () => {
  if (getEnvironmentInferenceConfiguration()) throw new InferenceConfigurationError('Inference is configured by the deployment', 409);
};
const validateConfigurationInput = input => {
  assertConfigurable();
  const baseUrl = normalizeInferenceUrl(input?.baseUrl);
  const action = input?.apiKeyAction;
  if (!['keep', 'replace', 'remove'].includes(action)) throw new InferenceConfigurationError('Choose whether to keep, replace, or remove the API key');
  if (action === 'replace') {
    if (typeof input.apiKey !== 'string') throw new InferenceConfigurationError('API key must be a string');
    try { validateHeaderValue('X-Inference-API-Key', input.apiKey); } catch { throw new InferenceConfigurationError('API key must be a valid HTTP header value'); }
  } else if (Object.hasOwn(input, 'apiKey')) throw new InferenceConfigurationError('Only a replacement may include an API key');
  return { baseUrl, action };
};
// Resolve a probe without persisting drafts or returning credentials to the browser.
export const getTestInferenceConfiguration = async input => {
  const { baseUrl, action } = validateConfigurationInput(input);
  const apiKey = action === 'keep' ? (await getEffectiveInferenceConfiguration()).apiKey
    : action === 'replace' ? input.apiKey || null : null;
  return { source: 'draft', baseUrl, apiKey, configurable: true };
};
export const saveInferenceConfiguration = async input => {
  const { baseUrl, action } = validateConfigurationInput(input);
  const Model = await model();
  // A partial update preserves the secret atomically, including concurrent endpoint edits.
  const values = { id: 1, baseUrl, ...(action !== 'keep' ? { apiKeyEncrypted: action === 'remove' ? null : encrypt(input.apiKey) } : {}) };
  if (action === 'keep') {
    const [row] = await Model.findOrCreate({ where: { id: 1 }, defaults: values });
    await row.update({ baseUrl });
  } else await Model.upsert(values);
  return serializeInferenceConfiguration(await getEffectiveInferenceConfiguration());
};
export const clearInferenceConfiguration = async () => {
  assertConfigurable();
  await (await model()).destroy({ where: { id: 1 } });
  return serializeInferenceConfiguration(await getEffectiveInferenceConfiguration());
};

// Domain scheduling can skip work without probing models or changing feed preferences.
export const isInferenceConfigured = async () => {
  try { return Boolean((await getEffectiveInferenceConfiguration()).baseUrl); } catch { return false; }
};
