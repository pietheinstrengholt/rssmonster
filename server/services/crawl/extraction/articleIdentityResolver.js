// Defines the url suffix external id type enforced by this service.
const URL_SUFFIX_EXTERNAL_ID_TYPE = 'url-suffix-hash';
// Defines the url suffix hash pattern enforced by this service.
const URL_SUFFIX_HASH_PATTERN = /(?:~|-)([a-f0-9]{8,64})$/i;

// This function extracts stable hash-like publisher identity from an article URL suffix.
export function resolvePublisherUrlIdentity(articleUrl) {
  // Returns no result when article url is not string or trim is unavailable.
  if (typeof articleUrl !== 'string' || !articleUrl.trim()) return null;

  try {
    // Derives the parsed url required while resolving publisher url identity.
    const parsedUrl = new URL(articleUrl);
    // Returns no result when parsed url protocol is not http: and parsed url protocol is not https:.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;

    // Derives the pathname through replace while resolving publisher url identity.
    const pathname = parsedUrl.pathname.replace(/\/+$/, '');
    // Derives the external id required while resolving publisher url identity.
    const externalId = pathname.match(URL_SUFFIX_HASH_PATTERN)?.[1]?.toLowerCase();
    // Returns no result when external id is unavailable or external id does not match the expected format or external id does not match the expected format.
    if (!externalId || !/[a-f]/i.test(externalId) || !/\d/.test(externalId)) return null;

    return {
      externalId,
      externalIdType: URL_SUFFIX_EXTERNAL_ID_TYPE
    };
  } catch {
    return null;
  }
}

// This function prefers stable publisher URL identity over adapter-provided fallbacks.
const articleIdentityResolver = entry => {
  // Derives the publisher identity required while performing article identity resolver.
  const publisherIdentity = resolvePublisherUrlIdentity(entry?.url) ||
    resolvePublisherUrlIdentity(entry?.link);
  // Returns early when publisher identity is available.
  if (publisherIdentity) return publisherIdentity;

  return {
    externalId: entry?.externalId ?? null,
    externalIdType: entry?.externalIdType ?? null
  };
};

export default articleIdentityResolver;
