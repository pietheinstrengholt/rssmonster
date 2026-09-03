import fs from 'node:fs';

const DEFAULT_SMTP_PORT = 587;
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+$/;

export class EmailConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailConfigurationError';
    this.code = 'EMAIL_CONFIGURATION_INVALID';
  }
}

// Returns a required trimmed configuration string without exposing its value in errors.
const requiredString = (environment, name) => {
  const value = String(environment[name] || '').trim();
  if (!value) throw new EmailConfigurationError(`${name} is required when email is enabled`);
  return value;
};

// Parses one strict environment boolean while retaining the supplied default when omitted.
const parseBoolean = (value, name, defaultValue) => {
  if (value === undefined || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new EmailConfigurationError(`${name} must be either true or false`);
};

// Parses the bounded SMTP port used by the configured transport.
const parseSmtpPort = value => {
  if (value === undefined || String(value).trim() === '') return DEFAULT_SMTP_PORT;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new EmailConfigurationError('SMTP_PORT must be an integer between 1 and 65535');
  }
  return port;
};

// Normalizes addresses before they are compared or persisted by account and email services.
export const normalizeEmailAddress = value => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !EMAIL_PATTERN.test(normalized)) {
    throw new EmailConfigurationError('Email address is invalid');
  }
  return normalized;
};

// Parses a sender mailbox into Nodemailer's provider-neutral address object.
const parseSender = value => {
  const sender = String(value || '').trim();
  const displayMatch = sender.match(/^([^<>]+?)\s*<([^<>]+)>$/);
  if (displayMatch) {
    return Object.freeze({
      name: displayMatch[1].trim(),
      address: normalizeEmailAddress(displayMatch[2])
    });
  }
  if (sender.includes('<') || sender.includes('>')) {
    throw new EmailConfigurationError('EMAIL_FROM must contain a valid mailbox');
  }
  return Object.freeze({ address: normalizeEmailAddress(sender) });
};

// Resolves and normalizes the externally visible application base URL.
const parsePublicAppUrl = value => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new EmailConfigurationError('PUBLIC_APP_URL must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new EmailConfigurationError(
      'PUBLIC_APP_URL must use HTTP or HTTPS and must not contain credentials'
    );
  }
  if (url.search || url.hash) {
    throw new EmailConfigurationError('PUBLIC_APP_URL must not contain a query or fragment');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
};

// Reads a Docker-style secret while preserving password whitespace other than one final newline.
const readPasswordFile = (filePath, readFile) => {
  let password;
  try {
    password = readFile(filePath, 'utf8');
  } catch {
    throw new EmailConfigurationError('SMTP_PASSWORD_FILE could not be read');
  }
  const normalized = String(password).replace(/\r?\n$/, '');
  if (!normalized) throw new EmailConfigurationError('SMTP_PASSWORD_FILE must not be empty');
  return normalized;
};

// Adds an intentionally non-enumerable transport password so logging the config cannot expose it.
const createAuthentication = (user, password) => {
  if (!user && !password) return null;
  if (!user || !password) {
    throw new EmailConfigurationError(
      'SMTP_USER and an SMTP password must either both be configured or both be omitted'
    );
  }
  const authentication = { user };
  Object.defineProperty(authentication, 'pass', {
    value: password,
    enumerable: false,
    writable: false
  });
  return Object.freeze(authentication);
};

// Returns whether outbound email was explicitly enabled for this process.
export const isEmailEnabled = (environment = process.env) =>
  parseBoolean(environment.EMAIL_ENABLED, 'EMAIL_ENABLED', false);

// Resolves the internal email configuration without requiring any fields while disabled.
export const getEmailConfiguration = (
  environment = process.env,
  { readFile = fs.readFileSync } = {}
) => {
  if (!isEmailEnabled(environment)) return Object.freeze({ enabled: false });

  const publicAppUrl = parsePublicAppUrl(requiredString(environment, 'PUBLIC_APP_URL'));
  const host = requiredString(environment, 'SMTP_HOST');
  const port = parseSmtpPort(environment.SMTP_PORT);
  const secure = parseBoolean(environment.SMTP_SECURE, 'SMTP_SECURE', port === 465);
  const requireTls = parseBoolean(
    environment.SMTP_REQUIRE_TLS,
    'SMTP_REQUIRE_TLS',
    port === 587
  );
  const pool = parseBoolean(environment.SMTP_POOL, 'SMTP_POOL', false);

  if (port === 465 && !secure) {
    throw new EmailConfigurationError('SMTP_SECURE must be true when SMTP_PORT is 465');
  }
  if (port === 587 && secure) {
    throw new EmailConfigurationError('SMTP_SECURE must be false when SMTP_PORT is 587');
  }
  if (secure && requireTls) {
    throw new EmailConfigurationError(
      'SMTP_REQUIRE_TLS applies to STARTTLS and must be false when SMTP_SECURE is true'
    );
  }

  const configuredPassword = environment.SMTP_PASSWORD;
  const passwordFile = String(environment.SMTP_PASSWORD_FILE || '').trim();
  const hasConfiguredPassword = configuredPassword !== undefined && configuredPassword !== '';
  if (hasConfiguredPassword && passwordFile) {
    throw new EmailConfigurationError(
      'SMTP_PASSWORD and SMTP_PASSWORD_FILE are mutually exclusive'
    );
  }
  const password = passwordFile
    ? readPasswordFile(passwordFile, readFile)
    : (hasConfiguredPassword ? String(configuredPassword) : '');
  const user = String(environment.SMTP_USER || '').trim();
  const auth = createAuthentication(user, password);
  const from = parseSender(requiredString(environment, 'EMAIL_FROM'));
  const replyTo = String(environment.EMAIL_REPLY_TO || '').trim()
    ? normalizeEmailAddress(environment.EMAIL_REPLY_TO)
    : null;

  return Object.freeze({
    enabled: true,
    publicAppUrl,
    smtp: Object.freeze({ host, port, secure, requireTls, pool, auth }),
    from,
    replyTo
  });
};

// Reports operational readiness without returning SMTP settings or credentials.
export const getEmailConfigurationStatus = (
  environment = process.env,
  options = {}
) => {
  let enabled = false;
  try {
    enabled = isEmailEnabled(environment);
  } catch {
    return Object.freeze({ enabled: false, configured: false });
  }

  try {
    getEmailConfiguration({ ...environment, EMAIL_ENABLED: 'true' }, options);
    return Object.freeze({ enabled, configured: true });
  } catch {
    return Object.freeze({ enabled, configured: false });
  }
};

export default {
  getEmailConfiguration,
  getEmailConfigurationStatus,
  isEmailEnabled,
  normalizeEmailAddress
};
