const URL_SUFFIX_EXTERNAL_ID_TYPE = 'url-suffix-hash';
const URL_SUFFIX_HASH_PATTERN = /(?:~|-)([a-f0-9]{8,64})$/i;

// This function extracts stable hash-like publisher identity from an article URL suffix.
export function resolvePublisherUrlIdentity(articleUrl) {
  if (typeof articleUrl !== 'string' || !articleUrl.trim()) return null;

  try {
    const parsedUrl = new URL(articleUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;

    const pathname = parsedUrl.pathname.replace(/\/+$/, '');
    const externalId = pathname.match(URL_SUFFIX_HASH_PATTERN)?.[1]?.toLowerCase();
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
  const publisherIdentity = resolvePublisherUrlIdentity(entry?.url) ||
    resolvePublisherUrlIdentity(entry?.link);
  if (publisherIdentity) return publisherIdentity;

  return {
    externalId: entry?.externalId ?? null,
    externalIdType: entry?.externalIdType ?? null
  };
};

export default articleIdentityResolver;
