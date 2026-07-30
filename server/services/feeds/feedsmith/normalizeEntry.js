import normalizeIdentity from './normalizeIdentity.js';
import normalizeMedia from './normalizeMedia.js';
import resolveArticleLink from './resolveArticleLink.js';

// This function converts parseable feed dates to the stored ISO format.
const normalizeDate = value => {
  // Returns no result when value is unavailable.
  if (!value) return null;
  // Normalizes the d used while normalizing date.
  const d = new Date(value);
  // Selects the result based on whether get time is na n.
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// This function returns the first parseable date from singular or repeated feed values.
const firstValidDate = value => {
  // Handles the case where value is an array.
  if (Array.isArray(value)) {
    // Processes each value entry in turn.
    for (const item of value) {
      // Derives the date through first valid date while performing first valid date.
      const date = firstValidDate(item);
      // Returns early when date is available.
      if (date) return date;
    }
    return null;
  }

  return normalizeDate(value);
};

// This function preserves repeated Dublin Core date order while supporting singular parser shapes.
const dublinCoreDates = namespace => namespace?.dates?.length
  ? namespace.dates
  : namespace?.date;

// Builds the published date candidates by format assembled for this service.
const publishedDateCandidatesByFormat = {
  rss: [
    entry => entry.pubDate,
    entry => entry.atom?.published,
    entry => dublinCoreDates(entry.dc),
    entry => dublinCoreDates(entry.dcterms)
  ],
  atom: [
    entry => entry.published,
    entry => dublinCoreDates(entry.dc),
    entry => dublinCoreDates(entry.dcterms)
  ],
  rdf: [
    entry => entry.atom?.published,
    entry => dublinCoreDates(entry.dc),
    entry => dublinCoreDates(entry.dcterms)
  ],
  json: [
    entry => entry.date_published
  ]
};

// Builds the modified date candidates by format assembled for this service.
const modifiedDateCandidatesByFormat = {
  rss: [
    entry => entry.atom?.updated,
    entry => entry.dcterms?.modified
  ],
  atom: [
    entry => entry.updated,
    entry => entry.dcterms?.modified
  ],
  rdf: [
    entry => entry.atom?.updated,
    entry => entry.dcterms?.modified
  ],
  json: [
    entry => entry.date_modified
  ]
};

// These lower-priority aliases retain compatibility for callers without a known feed format.
const fallbackPublishedDateCandidates = [
  entry => entry.date_published,
  entry => entry.pubDate,
  entry => entry.published,
  entry => entry.atom?.published,
  entry => dublinCoreDates(entry.dc),
  entry => dublinCoreDates(entry.dcterms),
  entry => entry.dcterms?.created,
  entry => entry.date,
  entry => entry.created
];

// Collects the fallback modified date candidates for this service.
const fallbackModifiedDateCandidates = [
  entry => entry.date_modified,
  entry => entry.updated,
  entry => entry.atom?.updated,
  entry => entry.dcterms?.modified
];

// Collects the feed date candidates for this service.
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

// Collects the url date patterns for this service.
const urlDatePatterns = [
  /(?:^|\/)(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/,
  /(?:^|\/)(\d{4})-(\d{1,2})-(\d{1,2})(?:\/|$)/
];

// This function returns the first non-empty text value from feed summary fields.
const firstTextValue = (...values) => {
  // Processes each values entry in turn.
  for (const value of values) {
    // Skips the current entry when value is not string.
    if (typeof value !== 'string') continue;
    // Skips the current entry when trim is value.
    if (value.trim() === '') continue;
    return value;
  }

  return null;
};

// This function resolves the first useful author name from RSS, Atom, or JSON Feed shapes.
const resolveAuthor = entry => {
  // Derives the author required while resolving author.
  const author = entry?.dc?.creator || entry?.author || entry?.dc?.creators?.[0];
  // Returns early when author is string.
  if (typeof author === 'string') return author;
  // Returns early when name is available.
  if (author?.name) return author.name;

  // Selects the json author based on whether authors is an array.
  const jsonAuthor = Array.isArray(entry?.authors) ? entry.authors[0] : null;
  return jsonAuthor?.name || null;
};

// This function builds a valid UTC date from URL date path components.
const normalizeUrlDateParts = (yearValue, monthValue, dayValue) => {
  // Coerces the year into the representation required while normalizing url date parts.
  const year = Number(yearValue);
  // Coerces the month into the representation required while normalizing url date parts.
  const month = Number(monthValue);
  // Coerces the day into the representation required while normalizing url date parts.
  const day = Number(dayValue);

  // Returns no result when year is not an integer or month is not an integer or day is not an integer.
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  // Normalizes the date used while normalizing url date parts.
  const date = new Date(Date.UTC(year, month - 1, day));
  // Returns no result when get utcfull year is not year or get utcmonth is not month or get utcdate is not day.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
};

// This function resolves the best publication date exposed by feed entry formats and namespaces.
export function resolveEntryPublishedDate(entry, feedFormat = null) {
  // Returns no result when entry is unavailable.
  if (!entry) return null;

  // Derives the candidates required while resolving entry published date.
  const candidates = publishedDateCandidatesByFormat[feedFormat] ||
    fallbackPublishedDateCandidates;
  // Processes each candidates entry in turn.
  for (const candidate of candidates) {
    // Derives the date through first valid date while resolving entry published date.
    const date = firstValidDate(candidate(entry));
    // Returns early when date is available.
    if (date) return date;
  }

  return null;
}

// This function resolves the publisher's article modification timestamp without inferring one.
export function resolveEntryModifiedDate(entry, feedFormat = null) {
  // Returns no result when entry is unavailable.
  if (!entry) return null;

  // Derives the candidates required while resolving entry modified date.
  const candidates = modifiedDateCandidatesByFormat[feedFormat] ||
    fallbackModifiedDateCandidates;
  // Processes each candidates entry in turn.
  for (const candidate of candidates) {
    // Derives the date through first valid date while resolving entry modified date.
    const date = firstValidDate(candidate(entry));
    // Returns early when date is available.
    if (date) return date;
  }

  return null;
}

// This function resolves a feed-level publication fallback from channel/feed metadata.
export function resolveFeedPublishedDate(feed) {
  // Returns no result when feed is unavailable.
  if (!feed) return null;

  // Processes each feed date candidates entry in turn.
  for (const candidate of feedDateCandidates) {
    // Derives the date through first valid date while resolving feed published date.
    const date = firstValidDate(candidate(feed));
    // Returns early when date is available.
    if (date) return date;
  }

  return null;
}

// This function resolves a date embedded in common article URL path patterns.
export function resolveUrlPublishedDate(url) {
  // Returns no result when url is unavailable or url is not string.
  if (!url || typeof url !== 'string') return null;

  let pathname = url;
  try {
    pathname = new URL(url, 'https://example.invalid').pathname;
  } catch {
    pathname = url;
  }

  // Processes each url date patterns entry in turn.
  for (const pattern of urlDatePatterns) {
    // Derives the match through match while resolving url published date.
    const match = pathname.match(pattern);
    // Skips the current entry when match is unavailable.
    if (!match) continue;

    // Normalizes the date before resolving url published date.
    const date = normalizeUrlDateParts(match[1], match[2], match[3]);
    // Returns early when date is available.
    if (date) return date;
  }

  return null;
}

// This function converts one Feedsmith entry into RSSMonster's canonical entry contract.
function normalizeEntry(entry, feedFormat = null) {

  // Selects the normalize category name based on whether value is string.
  const normalizeCategoryName = value =>
    typeof value === 'string'
      ? value.trim()
      : null;

  // Extracts the category name.
  const extractCategoryName = category => {
    // Returns no result when category is unavailable.
    if (!category) return null;

    // Returns early when category is string.
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

  // Selects the category sources based on whether entry categories is an array.
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

  // Resolves the article link while normalizing entry.
  const link = resolveArticleLink(entry);
  // Derives the content required while normalizing entry.
  const content = entry.content?.encoded ||
    entry.content ||
    entry.content_html ||
    entry.content_text ||
    null;
  // Normalizes the identity before normalizing entry.
  const identity = normalizeIdentity(entry, feedFormat);
  // Normalizes the media before normalizing entry.
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
    publishedAt: resolveEntryPublishedDate(entry, feedFormat),
    modifiedAt: resolveEntryModifiedDate(entry, feedFormat),
    ...identity,
    media: normalizedMedia.media,
    imageCandidates: normalizedMedia.imageCandidates
  };
}

export default normalizeEntry;
