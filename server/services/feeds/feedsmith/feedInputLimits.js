// Rejects hostile feed shapes before article enrichment or database work begins.

import { sanitizeFeedPersistenceMetadata } from '../feedPersistenceMetadata.js';

export const DEFAULT_FEED_INPUT_LIMITS = Object.freeze({
  entries: 1000,
  guidBytes: 4096,
  urlBytes: 8192,
  titleBytes: 4096,
  authorBytes: 2048,
  contentBytes: 2 * 1024 * 1024
});

// Reads one positive configured byte or count limit.
const configuredLimit = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

// Resolves all entry limits once for a parse operation.
export const getFeedInputLimits = () => Object.freeze({
  entries: configuredLimit(
    'FEED_MAX_ENTRIES',
    DEFAULT_FEED_INPUT_LIMITS.entries
  ),
  guidBytes: configuredLimit(
    'FEED_MAX_GUID_BYTES',
    DEFAULT_FEED_INPUT_LIMITS.guidBytes
  ),
  urlBytes: configuredLimit(
    'FEED_MAX_URL_BYTES',
    DEFAULT_FEED_INPUT_LIMITS.urlBytes
  ),
  titleBytes: configuredLimit(
    'FEED_MAX_TITLE_BYTES',
    DEFAULT_FEED_INPUT_LIMITS.titleBytes
  ),
  authorBytes: configuredLimit(
    'FEED_MAX_AUTHOR_BYTES',
    DEFAULT_FEED_INPUT_LIMITS.authorBytes
  ),
  contentBytes: configuredLimit(
    'FEED_MAX_CONTENT_BYTES',
    DEFAULT_FEED_INPUT_LIMITS.contentBytes
  )
});

// Creates a stable malformed-input error for one exceeded feed limit.
const inputLimitError = (field, limit) => {
  const error = new Error(`Feed ${field} exceeds the configured limit of ${limit}`);
  error.name = 'FeedInputLimitError';
  error.code = 'FEED_INPUT_LIMIT_EXCEEDED';
  error.field = field;
  error.limit = limit;
  return error;
};

// Measures UTF-8 bytes without coercing missing fields into text.
const byteLength = value => value === null || value === undefined
  ? 0
  : Buffer.byteLength(String(value), 'utf8');

// Rejects a scalar field when its UTF-8 representation is oversized.
const assertFieldBytes = (entry, field, limit) => {
  if (byteLength(entry?.[field]) > limit) throw inputLimitError(field, limit);
};

// Rejects excessive entry counts before entry normalization allocates more objects.
export const assertFeedEntryCount = (entries, limits = getFeedInputLimits()) => {
  if (entries.length > limits.entries) {
    throw inputLimitError('entry count', limits.entries);
  }
};

// Rejects oversized normalized fields before crawl enrichment begins.
export const assertNormalizedFeedLimits = (
  feed,
  limits = getFeedInputLimits()
) => {
  assertFeedEntryCount(feed.entries || [], limits);
  for (const entry of feed.entries || []) {
    assertFieldBytes(entry, 'externalId', limits.guidBytes);
    assertFieldBytes(entry, 'url', limits.urlBytes);
    assertFieldBytes(entry, 'title', limits.titleBytes);
    assertFieldBytes(entry, 'author', limits.authorBytes);
    if (
      byteLength(entry.content) + byteLength(entry.description) >
      limits.contentBytes
    ) {
      throw inputLimitError('content', limits.contentBytes);
    }
  }
  return sanitizeFeedPersistenceMetadata(feed);
};

export default {
  assertFeedEntryCount,
  assertNormalizedFeedLimits,
  getFeedInputLimits
};
