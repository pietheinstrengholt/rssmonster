import { createHash } from 'node:crypto';

import normalizeUrl from '../content/normalizeUrl.js';

// Defines the url suffix external id type enforced by this service.
const URL_SUFFIX_EXTERNAL_ID_TYPE = 'url-suffix-hash';
// Defines format-provided identity types that remain authoritative when URLs change.
const STABLE_EXTERNAL_ID_TYPES = new Set(['guid', 'atom-id', 'json-id']);
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

// This function reports whether an adapter identity is complete and safe to persist.
export const isCompleteArticleIdentity = identity =>
  typeof identity?.externalId === 'string' && identity.externalId.trim() !== '' &&
  typeof identity?.externalIdType === 'string' && identity.externalIdType.trim() !== '';

// This function reports whether an identity came from a stable feed-format field.
export const isStableArticleIdentity = identity =>
  isCompleteArticleIdentity(identity) && STABLE_EXTERNAL_ID_TYPES.has(identity.externalIdType);

// This function resolves a complete canonical URL identity without using collision-prone suffixes.
const resolveUrlIdentity = entry => {
  // Selects the article url from normalized and legacy caller shapes.
  const articleUrl = entry?.normalizedUrl || entry?.url || entry?.link;
  // Returns no result when article url is not string or trim is unavailable.
  if (typeof articleUrl !== 'string' || !articleUrl.trim()) return null;

  try {
    // Normalizes the complete URL while preserving identity beyond a shared path suffix.
    const externalId = normalizeUrl(articleUrl);
    // Derives the parsed url required while resolving url identity.
    const parsedUrl = new URL(externalId);
    // Returns no result when parsed url protocol is not http: and parsed url protocol is not https:.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
    return { externalId, externalIdType: 'normalized-url' };
  } catch {
    return null;
  }
};

// This function creates a deterministic last-resort identity from non-URL entry metadata.
const resolveMetadataIdentity = entry => {
  // Builds stable fallback components without serializing parser-specific object key order.
  const components = [
    entry?.contentSourceHash,
    entry?.contentTextHash,
    entry?.content,
    entry?.contentText,
    entry?.title,
    entry?.publishedAt,
    entry?.date_published,
    entry?.pubDate
  ].map(value => typeof value === 'string' ? value.trim() : '').filter(Boolean);
  // Returns no result when no deterministic metadata is available.
  if (!components.length) return null;

  return {
    externalId: createHash('sha256').update(components.join('\n\u0000\n')).digest('hex'),
    externalIdType: 'metadata-hash'
  };
};

// This function enforces stable feed ID, complete URL, then metadata-hash precedence.
const articleIdentityResolver = entry => {
  // Builds the adapter identity assembled while performing article identity resolver.
  const adapterIdentity = {
    externalId: typeof entry?.externalId === 'string' ? entry.externalId.trim() : null,
    externalIdType: typeof entry?.externalIdType === 'string'
      ? entry.externalIdType.trim()
      : null
  };
  // Returns early when the parser supplied a stable format identity.
  if (isStableArticleIdentity(adapterIdentity)) return adapterIdentity;
  // Preserves a parser-normalized complete URL identity before recomputing it.
  if (
    isCompleteArticleIdentity(adapterIdentity) &&
    adapterIdentity.externalIdType === 'normalized-url'
  ) return adapterIdentity;
  // Resolves the url identity required while performing article identity resolver.
  const urlIdentity = resolveUrlIdentity(entry);
  // Returns early when url identity is available.
  if (urlIdentity) return urlIdentity;
  // Preserves complete identities from older or custom parser adapters when no URL exists.
  if (isCompleteArticleIdentity(adapterIdentity)) return adapterIdentity;

  return resolveMetadataIdentity(entry) || { externalId: null, externalIdType: null };
};

export default articleIdentityResolver;
