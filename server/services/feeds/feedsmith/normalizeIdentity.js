import normalizeUrl from '../../crawl/content/normalizeUrl.js';
import resolveArticleLink from './resolveArticleLink.js';

// Defines the max external id length enforced by this service.
const MAX_EXTERNAL_ID_LENGTH = 1024;

// This function normalizes a publisher-provided identity value into stored text.
const normalizeExternalId = value => {
  // Returns no result when value is not string.
  if (typeof value !== 'string') return null;

  // Normalizes the external id before normalizing external id.
  const externalId = value.trim();
  // Returns no result when external id is unavailable or external id count exceeds max external id length.
  if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) return null;

  return externalId;
};

// This function resolves a normalized complete article URL as the safest fallback identity.
const resolveNormalizedUrlExternalId = entry => {
  // Resolves the article link while resolving normalized url external id.
  const articleUrl = resolveArticleLink(entry);
  // Returns no result when article url is unavailable.
  if (!articleUrl) return null;

  try {
    // Derives the parsed url required while resolving normalized url external id.
    const parsedUrl = new URL(articleUrl);
    // Returns no result when parsed url protocol is not http: and parsed url protocol is not https:.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  return normalizeExternalId(normalizeUrl(articleUrl));
};

// This function returns a resolved identity using the requested type label.
const resolvedIdentity = (externalId, externalIdType) => externalId
  ? { externalId, externalIdType }
  : null;

// This function resolves the supported external identity from a parsed feed entry.
const normalizeIdentity = (entry, feedFormat = null) => {
  // Selects the guid based on whether entry is string.
  const guid = typeof entry?.guid === 'string'
    ? entry.guid
    : entry?.guid?.value;
  // Normalizes the guid external id before normalizing identity.
  const guidExternalId = normalizeExternalId(guid);
  // Selects the json external id based on whether feed format is json.
  const jsonExternalId = feedFormat === 'json'
    ? normalizeExternalId(entry?.id)
    : null;
  // Derives the atom external id required while normalizing identity.
  const atomExternalId = normalizeExternalId(entry?.id) ||
    normalizeExternalId(entry?.atom?.id);
  // Resolves the d identity while normalizing identity.
  const jsonIdentity = resolvedIdentity(jsonExternalId, 'json-id');
  // Resolves the d identity while normalizing identity.
  const atomIdentity = resolvedIdentity(atomExternalId, 'atom-id');
  // Resolves the d identity while normalizing identity.
  const guidIdentity = resolvedIdentity(guidExternalId, 'guid');
  // Selects the format identities based on whether feed format is rss.
  const formatIdentities = feedFormat === 'rss'
    ? [guidIdentity, atomIdentity]
    : feedFormat === 'json'
      ? [jsonIdentity, guidIdentity]
      : [atomIdentity, guidIdentity];
  // Loads the feed identity needed while normalizing identity.
  const feedIdentity = formatIdentities.find(Boolean);

  // Returns early when feed identity is available.
  if (feedIdentity) return feedIdentity;

  // Resolves the normalized url external id while normalizing identity.
  const urlExternalId = resolveNormalizedUrlExternalId(entry);
  // Returns early when url external id is available.
  if (urlExternalId) {
    return {
      externalId: urlExternalId,
      externalIdType: 'normalized-url'
    };
  }

  return {
    externalId: null,
    externalIdType: null
  };
};

export default normalizeIdentity;
