import normalizeEntry, { resolveFeedPublishedDate } from './normalizeEntry.js';

// This function reads a URL from common Feedsmith scalar and object shapes.
const readUrl = value => {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  return readUrl(value.url || value.href || value.src);
};

// This function converts a Feedsmith parse result into RSSMonster's canonical feed contract.
export default function normalizeFeed(parsedFeed) {
  const sourceFeed = parsedFeed?.feed;
  if (!sourceFeed || typeof sourceFeed !== 'object') {
    throw new Error('Invalid feed structure');
  }

  const format = parsedFeed?.format || null;
  const sourceEntries = sourceFeed.entries ?? sourceFeed.items ?? [];
  const selfLink = (Array.isArray(sourceFeed.links) ? sourceFeed.links : [])
    .find(link => link?.rel === 'self' && link?.href)?.href;

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
    entries: (Array.isArray(sourceEntries) ? sourceEntries : [])
      .map(entry => normalizeEntry(entry, format))
  };
}
