import normalizeUrl from './normalizeUrl.js';

const MAX_EXTERNAL_ID_LENGTH = 1024;

// This function normalizes a publisher-provided identity value into stored text.
const normalizeExternalId = value => {
  if (typeof value !== 'string') return null;

  const externalId = value.trim();
  if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) return null;

  return externalId;
};

// This function returns the article URL exposed by RSS or Atom entry shapes.
const resolveArticleUrl = entry => {
  const atomLink = entry?.links?.find(link =>
    link?.href && (!link.rel || link.rel === 'alternate')
  ) || entry?.links?.find(link => link?.href);

  return normalizeExternalId(atomLink?.href) || normalizeExternalId(entry?.link);
};

// This function resolves a normalized complete article URL as the safest fallback identity.
const resolveNormalizedUrlExternalId = entry => {
  const articleUrl = resolveArticleUrl(entry);
  if (!articleUrl) return null;

  try {
    const parsedUrl = new URL(articleUrl);
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
const articleIdentityResolver = (entry, feedFormat = null) => {
  const guid = typeof entry?.guid === 'string'
    ? entry.guid
    : entry?.guid?.value;
  const guidExternalId = normalizeExternalId(guid);
  const atomExternalId = normalizeExternalId(entry?.id) ||
    normalizeExternalId(entry?.atom?.id);
  const atomIdentity = resolvedIdentity(atomExternalId, 'atom-id');
  const guidIdentity = resolvedIdentity(guidExternalId, 'guid');
  const formatIdentities = feedFormat === 'rss'
    ? [guidIdentity, atomIdentity]
    : [atomIdentity, guidIdentity];
  const feedIdentity = formatIdentities.find(Boolean);

  if (feedIdentity) return feedIdentity;

  const urlExternalId = resolveNormalizedUrlExternalId(entry);
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

export default articleIdentityResolver;
