import normalizeIdentity from './normalizeIdentity.js';
import normalizeMedia from './normalizeMedia.js';
import htmlToVisibleText from '../../crawl/content/htmlToVisibleText.js';
import {
  resolveArticleLinkResult,
  resolveContentBaseUrl,
  resolveSafeHttpUrl
} from './resolveArticleLink.js';

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
    entry => dublinCoreDates(entry.dcterms),
    entry => entry.dcterms?.issued,
    entry => entry.dcterms?.created
  ],
  atom: [
    entry => entry.published,
    entry => dublinCoreDates(entry.dc),
    entry => dublinCoreDates(entry.dcterms),
    entry => entry.dcterms?.issued,
    entry => entry.dcterms?.created
  ],
  rdf: [
    entry => entry.atom?.published,
    entry => dublinCoreDates(entry.dc),
    entry => dublinCoreDates(entry.dcterms),
    entry => entry.dcterms?.issued,
    entry => entry.dcterms?.created
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
  entry => entry.dcterms?.issued,
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
  feed => dublinCoreDates(feed.dc),
  feed => feed.dcterms?.modified,
  feed => feed.dcterms?.created,
  feed => feed.date
];

// Collects the url date patterns for this service.
const urlDatePatterns = [
  /(?:^|\/)(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/,
  /(?:^|\/)(\d{4})-(\d{1,2})-(\d{1,2})(?:\/|$)/
];

// This function returns whether one feed value contains selectable text.
const hasTextValue = value => typeof value === 'string' && value.trim() !== '';

// Atom text constructs carry their text in value; other feed formats use strings.
export const readTextValue = value => typeof value === 'string' ? value : value?.value;

const atomContentKind = value => ['html', 'xhtml', 'text/html', 'application/xhtml+xml']
  .includes(String(value?.type || 'text').trim().toLowerCase()) ? 'html' : 'text';

// Titles and feed descriptions are displayed as text, unlike article bodies and summaries.
export const readDisplayText = value => typeof value === 'object' && atomContentKind(value) === 'html'
  ? htmlToVisibleText(readTextValue(value))
  : readTextValue(value);

const firstText = values => values.find(hasTextValue) || null;

const atomContent = value => ({
  value: value.value,
  kind: atomContentKind(value),
  baseUrl: value.xml?.base
});

// This function accepts only content kinds understood by the crawl pipeline.
const normalizeContentKind = value => ['html', 'text'].includes(value) ? value : null;

// This function selects article body content while preserving format-specific semantics.
const resolveContent = (entry, feedFormat) => {
  if (hasTextValue(entry.content?.encoded)) {
    return { value: entry.content.encoded, kind: 'html' };
  }
  if (feedFormat === 'json' && hasTextValue(entry.content_html)) {
    return { value: entry.content_html, kind: 'html' };
  }
  if (feedFormat === 'json' && hasTextValue(entry.content_text)) {
    return { value: entry.content_text, kind: 'text' };
  }
  if (feedFormat === 'atom' && hasTextValue(entry.content?.value)) {
    return atomContent(entry.content);
  }
  if (hasTextValue(entry.content)) {
    return { value: entry.content, kind: normalizeContentKind(entry.contentKind) };
  }
  if (hasTextValue(entry.content_html)) {
    return { value: entry.content_html, kind: 'html' };
  }
  if (hasTextValue(entry.content_text)) {
    return { value: entry.content_text, kind: 'text' };
  }
  if (hasTextValue(entry.atom?.content?.value)) return atomContent(entry.atom.content);
  return { value: null, kind: null };
};

// This function returns the first Media RSS group description text. Video feeds such
// as YouTube carry their synopsis only in media:group/media:description and provide no
// summary or content element, so without this they normalize to an empty body.
const resolveMediaGroupDescription = entry => {
  const groups = [
    ...(entry?.media?.group ? [entry.media.group] : []),
    ...(Array.isArray(entry?.media?.groups) ? entry.media.groups : [])
  ];
  for (const group of groups) {
    const value = group?.description?.value ?? group?.description;
    if (hasTextValue(value)) {
      return { value, kind: atomContentKind(group.description) };
    }
  }
  return null;
};

// This function selects summary content and its safest known interpretation.
const resolveDescription = (entry, feedFormat) => {
  if (hasTextValue(entry.description)) {
    return {
      value: entry.description,
      kind: normalizeContentKind(entry.descriptionKind) ||
        (feedFormat === 'json' ? 'text' : 'html')
    };
  }
  if (hasTextValue(readTextValue(entry.summary))) {
    return {
      value: readTextValue(entry.summary),
      baseUrl: entry.summary?.xml?.base,
      kind: (typeof entry.summary === 'object' ? atomContentKind(entry.summary) : null) ||
        normalizeContentKind(entry.summaryKind) ||
        (feedFormat === 'json' ? 'text' : null)
    };
  }
  if (hasTextValue(readTextValue(entry.atom?.summary))) {
    return {
      value: readTextValue(entry.atom.summary),
      baseUrl: entry.atom.summary?.xml?.base,
      kind: typeof entry.atom.summary === 'object'
        ? atomContentKind(entry.atom.summary)
        : normalizeContentKind(entry.atom.summaryKind)
    };
  }
  const namespaceDescription = firstText([
    ...(entry.dc?.descriptions || []),
    ...(entry.dcterms?.descriptions || [])
  ]);
  if (namespaceDescription) return { value: namespaceDescription, kind: 'text' };
  const mediaGroupDescription = resolveMediaGroupDescription(entry);
  if (mediaGroupDescription) return mediaGroupDescription;
  return { value: null, kind: null };
};

// This function resolves the first useful author name from RSS, Atom, or JSON Feed shapes.
const resolveAuthor = (entry, feedFormat, sourceFeed) => {
  // Derives the author required while resolving author.
  const author = entry?.dc?.creator || entry?.author || entry?.dc?.creators?.[0];
  // Returns early when author is string.
  if (typeof author === 'string') return author;
  // Returns early when name is available.
  if (author?.name) return author.name;

  const inheritedAuthors = feedFormat === 'atom'
    ? entry.source?.authors ?? sourceFeed.authors
    : feedFormat === 'json' ? sourceFeed.authors : [];
  // Explicit entry authors override source/feed authors, including an empty JSON authors array.
  const authors = entry.authors ?? inheritedAuthors ?? [];
  return firstText([
    ...authors.map(person => person?.name || person?.email),
    ...(entry.atom?.authors || []).map(person => person?.name || person?.email),
    ...(entry.dcterms?.creators || []),
    entry.itunes?.author
  ]);
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
function normalizeEntry(entry, feedFormat = null, linkContext = {}, sourceFeed = {}) {

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
    ...(Array.isArray(entry.dc?.subjects) ? entry.dc.subjects : []),
    ...(Array.isArray(entry.dcterms?.subjects) ? entry.dcterms.subjects : []),
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

  // Resolves and classifies the article link while normalizing entry.
  const linkResult = resolveArticleLinkResult(entry, linkContext);
  const link = linkResult.url;
  // Keeps resource resolution separate from the optional navigable article URL.
  const baseContext = {
    ...linkContext,
    entryBaseUrl: entry?.xmlBase || null
  };
  const resourceBaseUrl = resolveContentBaseUrl(link, baseContext);
  const xmlBaseUrl = resolveContentBaseUrl(null, baseContext);
  // Resolves content and description with their source-defined semantics.
  const selectedContent = resolveContent(entry, feedFormat);
  const selectedDescription = resolveDescription(entry, feedFormat);
  // Construct-level bases resolve against XML ancestry, independently of the article permalink.
  const contentBaseUrl = resolveSafeHttpUrl(selectedContent.baseUrl, xmlBaseUrl) || resourceBaseUrl;
  const descriptionBaseUrl = resolveSafeHttpUrl(selectedDescription.baseUrl, xmlBaseUrl) || resourceBaseUrl;
  // Normalizes the identity before normalizing entry.
  const identity = normalizeIdentity(entry, feedFormat, link);
  // Normalizes the media before normalizing entry.
  const normalizedMedia = normalizeMedia(
    entry,
    selectedContent.kind === 'text' ? null : selectedContent.value,
    contentBaseUrl,
    resourceBaseUrl
  );

  return {
    title: firstText([
      readDisplayText(entry.title)?.trim(),
      readDisplayText(entry.atom?.title)?.trim(),
      ...(entry.dc?.titles || []),
      ...(entry.dcterms?.titles || [])
    ]) || 'Untitled',
    url: link || null,
    urlStatus: linkResult.status,
    contentBaseUrl,
    descriptionBaseUrl,
    description: selectedDescription.value,
    descriptionKind: selectedDescription.kind,
    content: selectedContent.value,
    contentKind: selectedContent.kind,
    author: resolveAuthor(entry, feedFormat, sourceFeed),
    categories: categoryNames,
    publishedAt: resolveEntryPublishedDate(entry, feedFormat),
    modifiedAt: resolveEntryModifiedDate(entry, feedFormat),
    ...identity,
    media: normalizedMedia.media,
    imageCandidates: normalizedMedia.imageCandidates
  };
}

export default normalizeEntry;
