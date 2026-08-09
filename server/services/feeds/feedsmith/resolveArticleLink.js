// This function reads a usable URL string from a parsed feed link value.
const readLinkValue = value => {
  // Returns no result when value is not string.
  if (typeof value !== 'string') return null;

  // Normalizes the link before performing read link value.
  const link = value.trim();
  return link || null;
};

// This function resolves one URL against an optional base and accepts only HTTP(S).
export const resolveSafeHttpUrl = (value, baseUrl = null) => {
  // Reads the candidate without treating missing values as invalid URLs.
  const candidate = readLinkValue(value);
  // Returns no result when candidate is unavailable.
  if (!candidate) return null;

  try {
    // Resolves relative and protocol-relative links only when a usable base exists.
    const parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

// This function selects and classifies the canonical article link across feed entry shapes.
export const resolveArticleLinkResult = (entry, {
  entryBaseUrl = entry?.xmlBase || null,
  feedUrl = null,
  feedBaseUrl = null,
  siteUrl = null
} = {}) => {
  // Selects the links based on whether links is an array.
  const links = [
    ...(Array.isArray(entry?.links) ? entry.links : []),
    ...(Array.isArray(entry?.atom?.links) ? entry.atom.links : [])
  ];
  // Loads the alternate link needed while resolving article link.
  const alternateLink = links.find(link =>
    readLinkValue(link?.href) && (!link.rel || link.rel === 'alternate')
  );
  // Loads the first valid link needed while resolving article link.
  const firstValidLink = links.find(link => readLinkValue(link?.href));
  // Selects the untrusted raw link before applying base and scheme policy.
  const rawLink = readLinkValue(alternateLink?.href) ||
    readLinkValue(firstValidLink?.href) ||
    readLinkValue(entry?.link) ||
    readLinkValue(entry?.url) ||
    readLinkValue(entry?.external_url);
  // Returns a distinct missing result when the entry declares no external link.
  if (!rawLink) return { url: null, status: 'missing', rawLink: null };

  // Resolves feed xml:base against the fetched feed URL before applying entry xml:base.
  const resolvedFeedBase = resolveSafeHttpUrl(feedBaseUrl, feedUrl) || feedUrl || siteUrl;
  // Resolves entry xml:base at the nearest XML scope.
  const resolvedEntryBase = resolveSafeHttpUrl(entryBaseUrl, resolvedFeedBase);
  // Selects the best available base according to XML scope and feed provenance.
  const baseUrl = resolvedEntryBase || resolvedFeedBase || siteUrl;
  // Resolves the safe url required while resolving article link result.
  const url = resolveSafeHttpUrl(rawLink, baseUrl);

  return { url, status: url ? 'resolved' : 'invalid', rawLink };
};

// This function returns only the safe navigable URL for compatibility callers.
const resolveArticleLink = (entry, options = {}) => resolveArticleLinkResult(entry, options).url;

export default resolveArticleLink;
