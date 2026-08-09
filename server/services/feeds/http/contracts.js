// Defines the HTTP-client-independent contracts used by feed acquisition.

export const FETCH_OUTCOMES = Object.freeze({
  CHANGED: 'changed',
  UNCHANGED: 'unchanged',
  NOT_MODIFIED: 'not_modified',
  RATE_LIMITED: 'rate_limited',
  TRANSIENT_FAILURE: 'transient_failure',
  PERMANENT_FAILURE: 'permanent_failure',
  MALFORMED: 'malformed',
  SECURITY_REJECTED: 'security_rejected',
  TOO_LARGE: 'too_large',
  TIMED_OUT: 'timed_out'
});

const fetchOutcomeTypes = new Set(Object.values(FETCH_OUTCOMES));

// Normalizes headers into an immutable lower-case string map.
const normalizeHeaders = (headers = {}) => Object.freeze(
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      String(value)
    ])
  )
);

// Creates a neutral outbound request without transport-specific options.
export const createHttpRequest = ({
  url,
  headers = {},
  retries = 1,
  timeoutMs = 5000,
  previousContentHash = null,
  deadlineAt = null,
  signal = null
}) => Object.freeze({
  url: String(url || ''),
  headers: normalizeHeaders(headers),
  retries,
  timeoutMs,
  previousContentHash,
  deadlineAt,
  signal
});

// Creates conditional headers only from previously accepted validators.
export const createConditionalHeaders = ({ etag, lastModified } = {}) => {
  const headers = {};
  if (etag) headers['if-none-match'] = String(etag);
  if (lastModified) headers['if-modified-since'] = String(lastModified);
  return Object.freeze(headers);
};

// Creates a neutral redirect-hop record.
export const createHttpRedirect = ({ fromUrl, toUrl, status }) =>
  Object.freeze({ fromUrl, toUrl, status });

// Creates the transport-neutral pull-and-cancel body stream contract.
export const createHttpBodyStream = ({ read, cancel }) =>
  Object.freeze({ read, cancel });

// Creates immutable metadata around one application-owned bounded byte buffer.
export const createHttpBodyContent = ({
  bytes,
  text,
  charset,
  charsetSource,
  contentHash
}) => Object.freeze({
  bytes: Uint8Array.from(bytes || []),
  text: String(text || ''),
  charset,
  charsetSource,
  contentHash
});

// Creates a neutral HTTP response whose body exposes no Fetch API types.
export const createHttpResponse = ({
  status,
  url,
  headers = {},
  redirects = [],
  body = null
}) => Object.freeze({
  status,
  url,
  headers: normalizeHeaders(headers),
  redirects: Object.freeze([...redirects]),
  body
});

// Creates a serializable transport error without retaining a client exception.
export const createHttpError = ({
  type,
  message,
  status = null,
  retryAfter = null,
  code = null
}) => Object.freeze({
  type,
  message,
  status,
  retryAfter,
  ...(code ? { code } : {})
});

// Creates one result from the closed feed-fetch outcome set.
export const createFetchOutcome = (type, details = {}) => {
  if (!fetchOutcomeTypes.has(type)) {
    throw new TypeError(`Unsupported fetch outcome: ${type}`);
  }

  return Object.freeze({ type, ...details });
};

// Reports whether an outcome contains a successfully acquired response body.
export const isSuccessfulFetchOutcome = outcome =>
  outcome?.type === FETCH_OUTCOMES.CHANGED ||
  outcome?.type === FETCH_OUTCOMES.UNCHANGED;

export default {
  FETCH_OUTCOMES,
  createFetchOutcome,
  createConditionalHeaders,
  createHttpBodyStream,
  createHttpBodyContent,
  createHttpError,
  createHttpRedirect,
  createHttpRequest,
  createHttpResponse,
  isSuccessfulFetchOutcome
};
