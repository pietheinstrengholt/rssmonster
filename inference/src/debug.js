export const isInferenceDebugEnabled = (environment = process.env) =>
  String(environment.INFERENCE_DEBUG || '').toLowerCase() === 'true';

const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'Error',
  'InferenceQueueAbortError',
  'InferenceQueueFullError',
  'RangeError',
  'SyntaxError',
  'TypeError'
]);
const SAFE_ERROR_CODES = new Set([
  'ABORT_ERR',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'INFERENCE_QUEUE_ABORTED',
  'INFERENCE_QUEUE_FULL'
]);
const SAFE_STARTUP_ERROR_CODES = new Set([
  ...SAFE_ERROR_CODES,
  'EACCES',
  'EADDRINUSE',
  'ENOENT',
  'ENOMEM',
  'ENOSPC',
  'EPERM',
  'ERR_MODULE_NOT_FOUND'
]);
const MAX_STARTUP_ERROR_MESSAGE_LENGTH = 500;
const STARTUP_URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const AUTHORIZATION_BEARER_PATTERN = /\b(authorization)\s*[:=]\s*bearer\s+[^\s,;]+/gi;
const BEARER_PATTERN = /\b(Bearer)\s+[^\s,;]+/gi;
const SENSITIVE_VALUE_PATTERN =
  /\b(api[-_]?key|credential|password|secret|token)\s*[:=]\s*[^\s,;&]+/gi;

// Provider error messages can contain prompts, URLs, responses, or credentials.
// Keep failure logs useful with a deliberately small allowlist of categorical metadata.
export const getSafeErrorDetails = error => {
  const details = {
    name: SAFE_ERROR_NAMES.has(error?.name) ? error.name : 'Error'
  };
  if (SAFE_ERROR_CODES.has(error?.code)) details.code = error.code;
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) {
    details.status = error.status;
  }
  return details;
};

const sanitizeStartupErrorMessage = message => {
  if (typeof message !== 'string') return null;
  const sanitized = message
    .replace(STARTUP_URL_PATTERN, '<redacted-url>')
    .replace(AUTHORIZATION_BEARER_PATTERN, '$1=REDACTED')
    .replace(BEARER_PATTERN, '$1 REDACTED')
    .replace(SENSITIVE_VALUE_PATTERN, '$1=REDACTED')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized ? sanitized.slice(0, MAX_STARTUP_ERROR_MESSAGE_LENGTH) : null;
};

// Startup has no request content, so retain a redacted operational message for model and listener
// failures while keeping the stricter categorical helper for provider request errors.
export const getSafeStartupErrorDetails = error => {
  const details = getSafeErrorDetails(error);
  const code = error?.code;
  const causeCode = error?.cause?.code;
  const message = sanitizeStartupErrorMessage(error?.message);

  if (SAFE_STARTUP_ERROR_CODES.has(code)) details.code = code;
  if (SAFE_STARTUP_ERROR_CODES.has(causeCode) && causeCode !== details.code) {
    details.causeCode = causeCode;
  }
  if (message) details.message = message;
  return details;
};

export const logInferenceDebug = (message, {
  environment = process.env,
  logger = console
} = {}) => {
  if (isInferenceDebugEnabled(environment)) {
    logger.log(`[INFERENCE DEBUG] ${message}`);
  }
};

export default logInferenceDebug;
