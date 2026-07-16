import normalizeIdentity from './normalizeIdentity.js';
import normalizeMedia from './normalizeMedia.js';
import resolveArticleLink from './resolveArticleLink.js';

// This function converts parseable feed dates to the stored ISO format.
const normalizeDate = value => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// This function returns the first parseable date from singular or repeated feed values.
const firstValidDate = value => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const date = firstValidDate(item);
      if (date) return date;
    }
    return null;
  }

  return normalizeDate(value);
};

const entryDateCandidates = [
  entry => entry.date_published,
  entry => entry.pubDate,
  entry => entry.published,
  entry => entry.atom?.published,
  entry => entry.updated,
  entry => entry.atom?.updated,
  entry => entry.dc?.date,
  entry => entry.dcterms?.created,
  entry => entry.date,
  entry => entry.created,
  entry => entry.date_modified,
  entry => entry.dcterms?.modified
];

const feedDateCandidates = [
  feed => feed.pubDate,
  feed => feed.updated,
  feed => feed.atom?.updated,
  feed => feed.date_modified,
  feed => feed.lastBuildDate,
  feed => feed.dc?.date,
  feed => feed.dcterms?.modified,
  feed => feed.dcterms?.created,
  feed => feed.date
];

const urlDatePatterns = [
  /(?:^|\/)(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/,
  /(?:^|\/)(\d{4})-(\d{1,2})-(\d{1,2})(?:\/|$)/
];

// This function returns the first non-empty text value from feed summary fields.
const firstTextValue = (...values) => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    if (value.trim() === '') continue;
    return value;
  }

  return null;
};

// This function resolves the first useful author name from RSS, Atom, or JSON Feed shapes.
const resolveAuthor = entry => {
  const author = entry?.dc?.creator || entry?.author || entry?.dc?.creators?.[0];
  if (typeof author === 'string') return author;
  if (author?.name) return author.name;

  const jsonAuthor = Array.isArray(entry?.authors) ? entry.authors[0] : null;
  return jsonAuthor?.name || null;
};

// This function builds a valid UTC date from URL date path components.
const normalizeUrlDateParts = (yearValue, monthValue, dayValue) => {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
};

// This function resolves the best published date exposed by feed entry formats and namespaces.
export function resolveEntryPublishedDate(entry) {
  if (!entry) return null;

  for (const candidate of entryDateCandidates) {
    const date = firstValidDate(candidate(entry));
    if (date) return date;
  }

  return null;
}

// This function resolves a feed-level published fallback from channel/feed metadata.
export function resolveFeedPublishedDate(feed) {
  if (!feed) return null;

  for (const candidate of feedDateCandidates) {
    const date = firstValidDate(candidate(feed));
    if (date) return date;
  }

  return null;
}

// This function resolves a date embedded in common article URL path patterns.
export function resolveUrlPublishedDate(url) {
  if (!url || typeof url !== 'string') return null;

  let pathname = url;
  try {
    pathname = new URL(url, 'https://example.invalid').pathname;
  } catch {
    pathname = url;
  }

  for (const pattern of urlDatePatterns) {
    const match = pathname.match(pattern);
    if (!match) continue;

    const date = normalizeUrlDateParts(match[1], match[2], match[3]);
    if (date) return date;
  }

  return null;
}

// This function converts one Feedsmith entry into RSSMonster's canonical entry contract.
function normalizeEntry(entry, feedFormat = null) {

  const normalizeCategoryName = value =>
    typeof value === 'string'
      ? value.trim()
      : null;

  const extractCategoryName = category => {
    if (!category) return null;

    if (typeof category === 'string') {
      return normalizeCategoryName(category);
    }

    return normalizeCategoryName(
      category.name ||
      category.term ||
      category.label ||
      category.value ||
      category._ ||
      category['#text'] ||
      category.$?.term ||
      category.$?.label ||
      category.$?.value ||
      category.$?.name
    );
  };

  const categorySources = [
    ...(Array.isArray(entry.categories) ? entry.categories : []),
    ...(Array.isArray(entry.category) ? entry.category : entry.category ? [entry.category] : []),
    ...(Array.isArray(entry.tags) ? entry.tags : []),
    ...(Array.isArray(entry.dc?.subject) ? entry.dc.subject : entry.dc?.subject ? [entry.dc.subject] : []),
    ...(Array.isArray(entry.subjects) ? entry.subjects : [])
  ];

  // Categories extraction
  const categoryNames = [...new Set(
    categorySources
      .map(extractCategoryName)
      .filter(Boolean)
      .filter(name => !name.includes('|'))
  )];

  const link = resolveArticleLink(entry);
  const content = entry.content?.encoded ||
    entry.content ||
    entry.content_html ||
    entry.content_text ||
    null;
  const identity = normalizeIdentity(entry, feedFormat);
  const normalizedMedia = normalizeMedia(entry, content, link);

  return {
    title: entry.title?.trim() || 'Untitled',
    url: link || null,
    description: firstTextValue(
      entry.description,
      entry.summary,
      entry.atom?.summary
    ),
    content,
    author: resolveAuthor(entry),
    categories: categoryNames,
    published: resolveEntryPublishedDate(entry),
    ...identity,
    media: normalizedMedia.media,
    imageCandidates: normalizedMedia.imageCandidates
  };
}

export default normalizeEntry;
