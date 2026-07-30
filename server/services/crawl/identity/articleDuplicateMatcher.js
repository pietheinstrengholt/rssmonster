import { createHash } from 'node:crypto';
import normalizeUrl from '../content/normalizeUrl.js';
import {
  findByFeedNormalizedUrlHash,
  findByFeedUrlHash,
  findByUserContentSourceHash,
  findByUserContentTextHash,
  findFeedTitleCandidates
} from './findExistingArticle.js';

// Defines the min title fallback length enforced by this service.
const MIN_TITLE_FALLBACK_LENGTH = 20;
// Defines the title fallback window days enforced by this service.
const TITLE_FALLBACK_WINDOW_DAYS = 7;

// This function hashes stable article identity fields for duplicate lookups.
const hashValue = value => createHash('sha256').update(value || '').digest('hex');

// This function determines whether a URL can safely identify an article.
const isStrongHttpUrl = url => {
  // Rejects the value when url is unavailable or url is not string.
  if (!url || typeof url !== 'string') return false;

  try {
    // Derives the parsed required while checking strong http url.
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// This function builds the duplicate identity used by cache and database matchers.
export function buildArticleIdentity({
  feed,
  title,
  link,
  normalizedUrl = null,
  contentSourceHash = null,
  contentTextHash = null,
  publishedAt = null
}) {
  // Selects the resolved normalized url based on whether link is available.
  const resolvedNormalizedUrl = normalizedUrl || (link ? normalizeUrl(link) : null);
  // Derives the has strong url required while building article identity.
  const hasStrongUrl = isStrongHttpUrl(link) && isStrongHttpUrl(resolvedNormalizedUrl);

  // Selects the result based on whether has strong url is available.
  return {
    userId: feed?.userId,
    feedId: feed?.id,
    title,
    link,
    normalizedUrl: resolvedNormalizedUrl,
    contentSourceHash,
    contentTextHash,
    publishedAt,
    hasStrongUrl,
    urlHash: hasStrongUrl ? hashValue(link) : null,
    normalizedUrlHash: hasStrongUrl ? hashValue(resolvedNormalizedUrl) : null
  };
}

// This function returns whether exact-title fallback is safe enough to use.
export function canUseTitleFallback(identity) {
  // Rejects the value when title is unavailable or identity is not string.
  if (!identity?.title || typeof identity.title !== 'string') return false;
  // Rejects the value when trim count is below min title fallback length.
  if (identity.title.trim().length < MIN_TITLE_FALLBACK_LENGTH) return false;
  // Rejects the value when identity published at is unavailable or get time is na n.
  if (!identity.publishedAt || Number.isNaN(new Date(identity.publishedAt).getTime())) return false;

  return !identity.hasStrongUrl;
}

// This function wraps matched article metadata in a consistent duplicate decision.
const duplicateMatch = (article, reason, scope, source) => {
  // Returns no result when id is unavailable.
  if (!article?.id) return null;

  return {
    matchedArticleId: article.id,
    reason,
    scope,
    source
  };
};

// This function resolves a cache hit with the duplicate decision metadata.
const matchCache = (duplicateCache, method, value, reason, scope) => {
  // Returns no result when duplicate cache is unavailable or value is unavailable or duplicate cache is not function.
  if (!duplicateCache || !value || typeof duplicateCache[method] !== 'function') return null;

  return duplicateMatch(
    duplicateCache[method](value),
    reason,
    scope,
    'cache'
  );
};

// This function resolves the first valid title candidate from the cache.
const matchCachedTitleFallback = (duplicateCache, identity) => {
  // Returns no result when can use title fallback is unavailable or duplicate cache is not function.
  if (!canUseTitleFallback(identity) || typeof duplicateCache?.findFeedTitleCandidates !== 'function') {
    return null;
  }

  // Finds the feed title candidates while performing match cached title fallback.
  const candidates = duplicateCache.findFeedTitleCandidates(identity.title);
  // Loads the candidate needed while performing match cached title fallback.
  const candidate = candidates.find(article => {
    // Normalizes the candidate published used while performing match cached title fallback.
    const candidatePublished = new Date(article.publishedAt);
    // Normalizes the identity published used while performing match cached title fallback.
    const identityPublished = new Date(identity.publishedAt);
    // Rejects the value when get time is na n or get time is na n.
    if (Number.isNaN(candidatePublished.getTime()) || Number.isNaN(identityPublished.getTime())) {
      return false;
    }

    // Derives the distance ms through abs while performing match cached title fallback.
    const distanceMs = Math.abs(candidatePublished.getTime() - identityPublished.getTime());
    return distanceMs <= TITLE_FALLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  });

  return duplicateMatch(candidate, 'title', 'feed', 'cache');
};

// This function resolves the first valid title candidate from the database.
const matchDatabaseTitleFallback = async identity => {
  // Returns no result when can use title fallback is unavailable.
  if (!canUseTitleFallback(identity)) return null;

  // Finds the feed title candidates while performing match database title fallback.
  const candidates = await findFeedTitleCandidates(identity, TITLE_FALLBACK_WINDOW_DAYS);
  return duplicateMatch(candidates[0], 'title', 'feed', 'database');
};

// This function finds a duplicate article using cache first, then database fallback.
export async function matchArticleDuplicate(identity, duplicateCache = null) {
  // Collects the checks while performing match article duplicate.
  const checks = [
    [
      'findByUserContentTextHash',
      findByUserContentTextHash,
      identity.contentTextHash,
      'contentTextHash',
      'user'
    ],
    [
      'findByUserContentSourceHash',
      findByUserContentSourceHash,
      identity.contentSourceHash,
      'contentSourceHash',
      'user'
    ],
    [
      'findByFeedNormalizedUrlHash',
      findByFeedNormalizedUrlHash,
      identity.normalizedUrlHash,
      'normalizedUrlHash',
      'feed'
    ],
    [
      'findByFeedUrlHash',
      findByFeedUrlHash,
      identity.urlHash,
      'urlHash',
      'feed'
    ]
  ];

  // Processes each checks entry in turn.
  for (const [method, find, value, reason, scope] of checks) {
    // Derives the match through match cache while performing match article duplicate.
    const match = matchCache(duplicateCache, method, value, reason, scope);
    // Returns early when match is available.
    if (match) return match;

    // Skips the current entry when value is unavailable.
    if (!value) continue;

    // Derives the database match through duplicate match while performing match article duplicate.
    const databaseMatch = duplicateMatch(
      await find(identity),
      reason,
      scope,
      'database'
    );
    // Returns early when database match is available.
    if (databaseMatch) return databaseMatch;
  }

  // Derives the cached title match through match cached title fallback while performing match article duplicate.
  const cachedTitleMatch = matchCachedTitleFallback(duplicateCache, identity);
  // Returns early when cached title match is available.
  if (cachedTitleMatch) return cachedTitleMatch;

  return matchDatabaseTitleFallback(identity);
}

export {
  MIN_TITLE_FALLBACK_LENGTH,
  TITLE_FALLBACK_WINDOW_DAYS
};
