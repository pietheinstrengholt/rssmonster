import normalizeEntry, { resolveFeedPublishedDate } from './normalizeEntry.js';
import {
  assertFeedEntryCount,
  getFeedInputLimits
} from './feedInputLimits.js';

// This function reads a URL from common Feedsmith scalar and object shapes.
const readUrl = value => {
  // Returns early when value is string.
  if (typeof value === 'string') return value.trim() || null;
  // Returns no result when value is unavailable or value is not object.
  if (!value || typeof value !== 'object') return null;
  return readUrl(value.url || value.href || value.src);
};

// This function converts a Feedsmith parse result into RSSMonster's canonical feed contract.
export default function normalizeFeed(parsedFeed) {
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
  const selfLink = (Array.isArray(sourceFeed.links) ? sourceFeed.links : [])
    .find(link => link?.rel === 'self' && link?.href)?.href;

  // Selects the result based on whether source entries is an array.
  return {
    format,
    title: sourceFeed.title || null,
    description: sourceFeed.description || null,
    faviconUrl: readUrl(sourceFeed.favicon) ||
      readUrl(sourceFeed.icon) ||
      readUrl(sourceFeed.logo) ||
      readUrl(sourceFeed.image),
    publishedAt: resolveFeedPublishedDate(sourceFeed),
    selfUrl: readUrl(parsedFeed.self) ||
      selfLink ||
      readUrl(sourceFeed.feed_url) ||
      null,
    entries: normalizedSourceEntries.map(entry => normalizeEntry(entry, format))
  };
}
