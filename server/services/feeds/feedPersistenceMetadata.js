// Bounds publisher-controlled feed metadata to the durable Feed schema.

export const FEED_PERSISTENCE_LIMITS = Object.freeze({
  urlCharacters: 255,
  titleCharacters: 255,
  descriptionBytes: 65_535,
  faviconUrlCharacters: 255,
  selfUrlCharacters: 8192
});

// Discards optional text that cannot fit its destination column.
export const boundedOptionalMetadata = (
  value,
  { maxCharacters = null, maxBytes = null } = {}
) => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  if (maxCharacters !== null && text.length > maxCharacters) return null;
  if (maxBytes !== null && Buffer.byteLength(text, 'utf8') > maxBytes) return null;
  return text;
};

// Removes oversized optional feed metadata before identity checks or persistence.
export const sanitizeFeedPersistenceMetadata = feed => ({
  ...feed,
  title: boundedOptionalMetadata(feed?.title, {
    maxCharacters: FEED_PERSISTENCE_LIMITS.titleCharacters
  }),
  description: boundedOptionalMetadata(feed?.description, {
    maxBytes: FEED_PERSISTENCE_LIMITS.descriptionBytes
  }),
  faviconUrl: boundedOptionalMetadata(feed?.faviconUrl, {
    maxCharacters: FEED_PERSISTENCE_LIMITS.faviconUrlCharacters
  }),
  selfUrl: boundedOptionalMetadata(feed?.selfUrl, {
    maxCharacters: FEED_PERSISTENCE_LIMITS.selfUrlCharacters
  })
});

// Rejects a required endpoint that cannot fit the Feed URL column.
export const assertFeedPersistenceUrl = value => {
  const url = String(value || '');
  if (url.length <= FEED_PERSISTENCE_LIMITS.urlCharacters) return url;

  const error = new Error(
    `Feed URL exceeds the persistence limit of ` +
    `${FEED_PERSISTENCE_LIMITS.urlCharacters} characters`
  );
  error.name = 'FeedPersistenceMetadataError';
  error.code = 'FEED_PERSISTENCE_URL_TOO_LONG';
  error.field = 'url';
  error.limit = FEED_PERSISTENCE_LIMITS.urlCharacters;
  throw error;
};

export default {
  FEED_PERSISTENCE_LIMITS,
  assertFeedPersistenceUrl,
  boundedOptionalMetadata,
  sanitizeFeedPersistenceMetadata
};
