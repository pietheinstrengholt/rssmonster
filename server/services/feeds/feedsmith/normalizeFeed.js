import normalizeEntry, { readDisplayText, resolveFeedPublishedDate } from './normalizeEntry.js';
import {
  assertFeedEntryCount,
  getFeedInputLimits
} from './feedInputLimits.js';
import { resolveSafeHttpUrl } from './resolveArticleLink.js';
import { FEED_PERSISTENCE_LIMITS } from '../feedPersistenceMetadata.js';

// This function reads a URL from common Feedsmith scalar and object shapes.
const readUrl = value => {
  // Returns early when value is string.
  if (typeof value === 'string') return value.trim() || null;
  // Returns no result when value is unavailable or value is not object.
  if (!value || typeof value !== 'object') return null;
  return readUrl(value.url || value.href || value.src);
};

// This function converts a Feedsmith parse result into RSSMonster's canonical feed contract.
export default function normalizeFeed(parsedFeed, { feedUrl = null } = {}) {
  const sourceFeed = parsedFeed?.feed;
  // Rejects processing when source feed is unavailable or source feed is not object.
  if (!sourceFeed || typeof sourceFeed !== 'object') {
    throw new Error('Invalid feed structure');
  }

  // Derives the format required while normalizing feed.
  const format = parsedFeed?.format || null;
  // Derives the source entries required while normalizing feed.
  const sourceEntries = sourceFeed.entries ?? sourceFeed.items ?? [];
  const normalizedSourceEntries = Array.isArray(sourceEntries)
    ? sourceEntries
    : [];
  assertFeedEntryCount(normalizedSourceEntries, getFeedInputLimits());
  // Selects the self link based on whether source feed links is an array.
  const feedLinks = [...(sourceFeed.links || []), ...(sourceFeed.atom?.links || [])];
  const selfLink = feedLinks
    .find(link => link?.rel === 'self' && link?.href)?.href;
  // Selects the publisher site URL without confusing Atom self links for article bases.
  const siteLink = feedLinks
    .find(link => (!link?.rel || link.rel === 'alternate') && link?.href)?.href ||
    sourceFeed.link || sourceFeed.home_page_url;
  // Resolves the safe feed and site bases required by entry link normalization.
  const safeFeedUrl = resolveSafeHttpUrl(feedUrl);
  const safeSiteUrl = resolveSafeHttpUrl(siteLink, safeFeedUrl);
  const resourceBaseUrl = resolveSafeHttpUrl(sourceFeed.xmlBase, safeFeedUrl) ||
    safeFeedUrl || safeSiteUrl;
  // Skip unusable candidates so a broken preferred icon does not hide a valid fallback.
  const faviconUrl = [sourceFeed.favicon, sourceFeed.icon, sourceFeed.logo, sourceFeed.image, sourceFeed.itunes?.image]
    .map(value => resolveSafeHttpUrl(readUrl(value), resourceBaseUrl))
    .find(url => url && url.length <= FEED_PERSISTENCE_LIMITS.faviconUrlCharacters) || null;
  const linkContext = {
    feedUrl: safeFeedUrl,
    feedBaseUrl: sourceFeed.xmlBase || null,
    siteUrl: safeSiteUrl
  };

  // Selects the result based on whether source entries is an array.
  return {
    format,
    title: readDisplayText(sourceFeed.title) || sourceFeed.dc?.titles?.[0] || sourceFeed.dcterms?.titles?.[0] || null,
    description: sourceFeed.description || readDisplayText(sourceFeed.subtitle) ||
      sourceFeed.dc?.descriptions?.[0] || sourceFeed.dcterms?.descriptions?.[0] || null,
    faviconUrl,
    publishedAt: resolveFeedPublishedDate(sourceFeed),
    selfUrl: readUrl(parsedFeed.self) ||
      selfLink ||
      readUrl(sourceFeed.feed_url) ||
      null,
    entries: normalizedSourceEntries.map(entry => normalizeEntry(entry, format, linkContext, sourceFeed))
  };
}
