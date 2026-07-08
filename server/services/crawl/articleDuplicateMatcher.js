import { createHash } from 'node:crypto';
import normalizeUrl from './normalizeUrl.js';
import {
  findByFeedNormalizedUrlHash,
  findByFeedUrlHash,
  findByUserContentHash,
  findByUserContentStrippedHash,
  findFeedTitleCandidates
} from './findExistingArticle.js';

const MIN_TITLE_FALLBACK_LENGTH = 20;
const TITLE_FALLBACK_WINDOW_DAYS = 7;

// This function hashes stable article identity fields for duplicate lookups.
const hashValue = value => createHash('sha256').update(value || '').digest('hex');

// This function determines whether a URL can safely identify an article.
const isStrongHttpUrl = url => {
  if (!url || typeof url !== 'string') return false;

  try {
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
  contentHash = null,
  contentStrippedHash = null,
  published = null
}) {
  const resolvedNormalizedUrl = normalizedUrl || (link ? normalizeUrl(link) : null);
  const hasStrongUrl = isStrongHttpUrl(link) && isStrongHttpUrl(resolvedNormalizedUrl);

  return {
    userId: feed?.userId,
    feedId: feed?.id,
    title,
    link,
    normalizedUrl: resolvedNormalizedUrl,
    contentHash,
    contentStrippedHash,
    published,
    hasStrongUrl,
    urlHash: hasStrongUrl ? hashValue(link) : null,
    normalizedUrlHash: hasStrongUrl ? hashValue(resolvedNormalizedUrl) : null
  };
}

// This function returns whether exact-title fallback is safe enough to use.
export function canUseTitleFallback(identity) {
  if (!identity?.title || typeof identity.title !== 'string') return false;
  if (identity.title.trim().length < MIN_TITLE_FALLBACK_LENGTH) return false;
  if (!identity.published || Number.isNaN(new Date(identity.published).getTime())) return false;

  return !identity.hasStrongUrl;
}

// This function wraps matched article metadata in a consistent duplicate decision.
const duplicateMatch = (article, reason, scope, source) => {
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
  if (!canUseTitleFallback(identity) || typeof duplicateCache?.findFeedTitleCandidates !== 'function') {
    return null;
  }

  const candidates = duplicateCache.findFeedTitleCandidates(identity.title);
  const candidate = candidates.find(article => {
    const candidatePublished = new Date(article.published);
    const identityPublished = new Date(identity.published);
    if (Number.isNaN(candidatePublished.getTime()) || Number.isNaN(identityPublished.getTime())) {
      return false;
    }

    const distanceMs = Math.abs(candidatePublished.getTime() - identityPublished.getTime());
    return distanceMs <= TITLE_FALLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  });

  return duplicateMatch(candidate, 'title', 'feed', 'cache');
};

// This function resolves the first valid title candidate from the database.
const matchDatabaseTitleFallback = async identity => {
  if (!canUseTitleFallback(identity)) return null;

  const candidates = await findFeedTitleCandidates(identity, TITLE_FALLBACK_WINDOW_DAYS);
  return duplicateMatch(candidates[0], 'title', 'feed', 'database');
};

// This function finds a duplicate article using cache first, then database fallback.
export async function matchArticleDuplicate(identity, duplicateCache = null) {
  const checks = [
    [
      'findByUserContentStrippedHash',
      findByUserContentStrippedHash,
      identity.contentStrippedHash,
      'contentStrippedHash',
      'user'
    ],
    [
      'findByUserContentHash',
      findByUserContentHash,
      identity.contentHash,
      'contentHash',
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

  for (const [method, find, value, reason, scope] of checks) {
    const match = matchCache(duplicateCache, method, value, reason, scope);
    if (match) return match;

    if (!value) continue;

    const databaseMatch = duplicateMatch(
      await find(identity),
      reason,
      scope,
      'database'
    );
    if (databaseMatch) return databaseMatch;
  }

  const cachedTitleMatch = matchCachedTitleFallback(duplicateCache, identity);
  if (cachedTitleMatch) return cachedTitleMatch;

  return matchDatabaseTitleFallback(identity);
}

export {
  MIN_TITLE_FALLBACK_LENGTH,
  TITLE_FALLBACK_WINDOW_DAYS
};
