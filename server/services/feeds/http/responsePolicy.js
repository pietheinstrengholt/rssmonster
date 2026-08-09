// Parses HTTP caching, validation, and retry headers into neutral policy values.

const SECOND_MS = 1000;
const MAX_ETAG_LENGTH = 2048;
export const DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS = 24 * 60 * 60 * SECOND_MS;
export const DEFAULT_FEED_RETRY_AFTER_MAX_MS = 7 * 24 * 60 * 60 * SECOND_MS;
const HTTP_DATE_PATTERNS = [
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/,
  /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT$/,
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/
];

// Parses an HTTP date while rejecting values JavaScript cannot represent safely.
const parseHttpDate = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  if (!HTTP_DATE_PATTERNS.some(pattern => pattern.test(normalized))) return null;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};

// Accepts strong and weak entity tags without interpreting their opaque value.
const parseEntityTag = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length > MAX_ETAG_LENGTH) return null;
  return /^(?:W\/)?"[^"\r\n]*"$/.test(normalized) ? normalized : null;
};

// Parses one non-negative integer header without accepting partial values.
const parseNonNegativeInteger = value => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

// Resolves one positive operational deadline bound from environment configuration.
const configuredPositiveMilliseconds = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

// Caps a publisher deadline without allowing it to precede response receipt.
const boundDeadline = (deadline, receivedAt, maxDelayMs) => {
  if (!deadline) return null;
  const timestamp = Math.min(
    Math.max(deadline.getTime(), receivedAt.getTime()),
    receivedAt.getTime() + maxDelayMs,
    8.64e15
  );
  return new Date(timestamp);
};

// Converts header seconds while capping arithmetic at the relevant operational limit.
const secondsToMilliseconds = (seconds, maximum = 8.64e15) =>
  Math.min(seconds * SECOND_MS, maximum);

// Extracts a numeric Cache-Control directive, including quoted integer values.
const parseCacheDirectiveSeconds = (cacheControl, directiveName) => {
  const pattern = new RegExp(
    `(?:^|,)\\s*${directiveName}\\s*=\\s*(?:"(\\d+)"|(\\d+))\\s*(?:,|$)`,
    'i'
  );
  const match = String(cacheControl || '').match(pattern);
  if (!match) return null;
  return parseNonNegativeInteger(match[1] ?? match[2]);
};

// Calculates response freshness using RFC cache age inputs at receipt time.
const calculateFreshUntil = (headers, receivedAt, maxFreshnessMs) => {
  const cacheControl = headers['cache-control'] || '';
  if (/(?:^|,)\s*(?:no-cache|no-store)\s*(?:,|$)/i.test(cacheControl)) {
    return new Date(receivedAt);
  }

  const responseDate = parseHttpDate(headers.date) || receivedAt;
  const ageSeconds = parseNonNegativeInteger(headers.age) || 0;
  const ageMs = secondsToMilliseconds(ageSeconds);
  const apparentAgeMs = Math.max(0, receivedAt.getTime() - responseDate.getTime());
  const currentAgeMs = Math.max(apparentAgeMs, ageMs);
  const maxAgeSeconds = parseCacheDirectiveSeconds(cacheControl, 'max-age');

  let freshnessLifetimeMs = null;
  if (maxAgeSeconds !== null) {
    freshnessLifetimeMs = secondsToMilliseconds(maxAgeSeconds);
  }
  if (freshnessLifetimeMs === null) {
    const expiresAt = parseHttpDate(headers.expires);
    if (expiresAt) {
      freshnessLifetimeMs = Math.max(
        0,
        expiresAt.getTime() - responseDate.getTime()
      );
    }
  }

  if (freshnessLifetimeMs === null) return null;
  const remainingFreshnessMs = Math.min(
    Math.max(0, freshnessLifetimeMs - currentAgeMs),
    maxFreshnessMs
  );
  return boundDeadline(
    new Date(Math.min(receivedAt.getTime() + remainingFreshnessMs, 8.64e15)),
    receivedAt,
    maxFreshnessMs
  );
};

// Parses Retry-After delta-seconds or an absolute HTTP date into one deadline.
const parseRetryAfter = (value, receivedAt, maxRetryAfterMs) => {
  const deltaSeconds = parseNonNegativeInteger(value);
  if (deltaSeconds !== null) {
    const deltaMs = secondsToMilliseconds(deltaSeconds, maxRetryAfterMs);
    const retryTimestamp = Math.min(receivedAt.getTime() + deltaMs, 8.64e15);
    return boundDeadline(
      new Date(retryTimestamp),
      receivedAt,
      maxRetryAfterMs
    );
  }

  const retryAt = parseHttpDate(value);
  if (!retryAt) return null;
  return boundDeadline(retryAt, receivedAt, maxRetryAfterMs);
};

// Creates the transport-independent response policy consumed by persistence.
export const parseResponsePolicy = (headers = {}, receivedAt = new Date()) => {
  const normalizedReceivedAt = new Date(receivedAt);
  const lastModifiedAt = parseHttpDate(headers['last-modified']);
  const maxFreshnessMs = configuredPositiveMilliseconds(
    'FEED_CACHE_FRESHNESS_MAX_MS',
    DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS
  );
  const maxRetryAfterMs = configuredPositiveMilliseconds(
    'FEED_RETRY_AFTER_MAX_MS',
    DEFAULT_FEED_RETRY_AFTER_MAX_MS
  );

  return Object.freeze({
    etag: parseEntityTag(headers.etag),
    lastModified: lastModifiedAt ? headers['last-modified'].trim() : null,
    cacheFreshUntil: calculateFreshUntil(
      headers,
      normalizedReceivedAt,
      maxFreshnessMs
    ),
    retryAfterAt: parseRetryAfter(
      headers['retry-after'],
      normalizedReceivedAt,
      maxRetryAfterMs
    )
  });
};

export default { parseResponsePolicy };
