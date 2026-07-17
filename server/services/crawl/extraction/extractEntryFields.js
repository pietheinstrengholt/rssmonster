// This function maps an RSSMonster canonical entry to crawl source field names.
const extractEntryFields = entry => ({
  title: entry?.title || 'Untitled',
  link: entry?.url || null,
  description: entry?.description ?? null,
  content: entry?.content ?? null,
  author: entry?.author ?? null,
  categories: Array.isArray(entry?.categories) ? entry.categories : [],
  publishedAt: entry?.publishedAt ?? null,
  modifiedAt: entry?.modifiedAt ?? null
});

export {
  resolveEntryModifiedDate,
  resolveEntryPublishedDate,
  resolveFeedPublishedDate,
  resolveUrlPublishedDate
} from '../../feeds/feedsmith/normalizeEntry.js';

export default extractEntryFields;
