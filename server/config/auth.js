// This function returns the configured JWT signing secret.
export const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing required env var: JWT_SECRET');
  }

  return process.env.JWT_SECRET;
};

// This function returns the configured Fever credential protection secret.
export const getFeverCredentialSecret = () => {
  if (!process.env.FEVER_CREDENTIAL_SECRET) {
    throw new Error('Missing required env var: FEVER_CREDENTIAL_SECRET');
  }

  return process.env.FEVER_CREDENTIAL_SECRET;
};

export class AuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthConfigurationError';
    this.code = 'AUTH_CONFIGURATION_INVALID';
  }
}

const parseBoolean = (environment, name, defaultValue) => {
  const value = String(environment[name] ?? '').trim().toLowerCase();
  if (!value) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AuthConfigurationError(`${name} must be either true or false`);
};

const requiredString = (environment, name) => {
  const value = String(environment[name] ?? '').trim();
  if (!value) throw new AuthConfigurationError(`${name} is required when OIDC is enabled`);
  return value;
};

// Preserve the issuer's exact spelling for later OIDC issuer validation.
const requireUrl = (environment, name, { allowLoopback = false } = {}) => {
  const value = requiredString(environment, name);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AuthConfigurationError(`${name} must be a valid URL`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(allowLoopback && loopback && url.protocol === 'http:')) ||
    url.username || url.password || url.search || url.hash
  ) {
    throw new AuthConfigurationError(
      `${name} must use HTTPS without credentials, query parameters, or a fragment` +
      (allowLoopback ? ' (HTTP is allowed for loopback redirects)' : '')
    );
  }
  return value;
};

const commaSeparatedValues = (environment, name) => {
  const value = String(environment[name] ?? '').trim();
  if (!value) return [];
  const values = value.split(',').map(item => item.trim());
  if (values.some(item => !item)) throw new AuthConfigurationError(`${name} must be a comma-separated list without empty entries`);
  return [...new Set(values)];
};

const oidcAccessPolicy = environment => {
  const allowedEmailDomains = [...new Set(commaSeparatedValues(environment, 'OIDC_ALLOWED_EMAIL_DOMAINS').map(domain => domain.toLowerCase()))];
  if (allowedEmailDomains.some(domain => domain.length > 253 || !domain.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ))) throw new AuthConfigurationError('OIDC_ALLOWED_EMAIL_DOMAINS must contain exact DNS domain names without wildcards');
  const allowedGroups = commaSeparatedValues(environment, 'OIDC_ALLOWED_GROUPS');
  const groupsClaim = String(environment.OIDC_GROUPS_CLAIM ?? '').trim() || 'groups';
  if (['__proto__', 'constructor', 'prototype'].includes(groupsClaim)) {
    throw new AuthConfigurationError('OIDC_GROUPS_CLAIM must name a provider claim');
  }
  return { allowedEmailDomains, allowedGroups, groupsClaim };
};

export const isRegistrationEnabled = (environment = process.env) =>
  parseBoolean(environment, 'ALLOW_REGISTRATION', true);

export const isLocalAuthEnabled = (environment = process.env) =>
  parseBoolean(environment, 'LOCAL_AUTH_ENABLED', true);

// This server-only configuration includes credentials and must never be serialized to clients.
export const getAuthConfiguration = (environment = process.env) => {
  const registrationEnabled = isRegistrationEnabled(environment);
  const localAuthEnabled = isLocalAuthEnabled(environment);
  const oidcEnabled = parseBoolean(environment, 'OIDC_ENABLED', false);
  const oidcAutoProvision = parseBoolean(environment, 'OIDC_AUTO_PROVISION', false);
  if (!localAuthEnabled && !oidcEnabled) {
    throw new AuthConfigurationError('At least one authentication method must be enabled');
  }

  let oidc = null;
  if (oidcEnabled) {
    const issuerUrl = requireUrl(environment, 'OIDC_ISSUER_URL');
    const clientId = requiredString(environment, 'OIDC_CLIENT_ID');
    const clientSecret = requiredString(environment, 'OIDC_CLIENT_SECRET');
    const redirectUri = requireUrl(environment, 'OIDC_REDIRECT_URI', { allowLoopback: true });
    const frontendUrl = String(environment.OIDC_FRONTEND_URL ?? '').trim()
      ? requireUrl(environment, 'OIDC_FRONTEND_URL', { allowLoopback: true })
      : new URL('/', redirectUri).href;
    const frontend = new URL(frontendUrl);
    const callback = new URL(redirectUri);
    // Same-host, same-scheme deployments retain browser-bound SameSite cookies across ports.
    if (frontend.pathname !== '/' || frontend.hostname !== callback.hostname || frontend.protocol !== callback.protocol) {
      throw new AuthConfigurationError('OIDC_FRONTEND_URL must be a root URL with the same scheme and hostname as OIDC_REDIRECT_URI; ports may differ');
    }
    const scopes = String(environment.OIDC_SCOPES ?? 'openid profile email').trim().split(/\s+/);
    if (!scopes.includes('openid')) {
      throw new AuthConfigurationError('OIDC_SCOPES must include openid');
    }
    oidc = { issuerUrl, clientId, clientSecret, redirectUri, frontendUrl, scopes: [...new Set(scopes)], autoProvision: oidcAutoProvision, accessPolicy: oidcAccessPolicy(environment) };
  }
  return { registrationEnabled, localAuthEnabled, oidcEnabled, oidcAutoProvision, oidc };
};

export const validateAuthConfiguration = (environment = process.env) => {
  const configuration = getAuthConfiguration(environment);
  if (configuration.oidcEnabled && new URL(configuration.oidc.redirectUri).pathname !== '/api/auth/oidc/callback') {
    throw new AuthConfigurationError('OIDC_REDIRECT_URI must use the path /api/auth/oidc/callback');
  }
  return configuration;
};
