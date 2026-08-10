import { load } from 'cheerio';

// This function returns an XML element's namespace-independent local name.
const localName = node => String(node?.name || '').toLowerCase().split(':').pop();

// This function returns direct child elements with one local name.
const childElements = (node, name) => (node?.children || [])
  .filter(child => child.type === 'tag' && localName(child) === name);

// This function returns one trimmed scalar value without changing opaque semantics.
const scalarValue = value => {
  if (typeof value === 'string') return value.trim() || null;
  return null;
};

// This function reads one raw XML child's decoded text value.
const rawChildText = ($, entryElement, name) => {
  const child = childElements(entryElement, name)[0];
  return child ? scalarValue($(child).text()) : null;
};

// This function reads the format-provided stable identity from raw XML.
const rawStableId = ($, entryElement, format) => rawChildText(
  $,
  entryElement,
  format === 'atom' ? 'id' : 'guid'
);

// This function reads the preferred entry link from raw XML.
const rawLink = ($, entryElement, format) => {
  if (format !== 'atom') return rawChildText($, entryElement, 'link');

  const links = childElements(entryElement, 'link');
  const preferred = links.find(link => !link.attribs?.rel || link.attribs.rel === 'alternate') ||
    links[0];
  return scalarValue(preferred?.attribs?.href);
};

// This function reads the format-provided stable identity from one parsed entry.
const parsedStableId = (entry, format) => {
  if (format === 'atom') return scalarValue(entry?.id) || scalarValue(entry?.atom?.id);
  return scalarValue(entry?.guid) || scalarValue(entry?.guid?.value);
};

// This function reads the preferred link from one parsed entry.
const parsedLink = (entry, format) => {
  if (format !== 'atom') {
    return scalarValue(entry?.link) || scalarValue(entry?.url);
  }

  const links = [
    ...(Array.isArray(entry?.links) ? entry.links : []),
    ...(Array.isArray(entry?.atom?.links) ? entry.atom.links : [])
  ];
  const preferred = links.find(link => (
    scalarValue(link?.href) && (!link.rel || link.rel === 'alternate')
  )) || links.find(link => scalarValue(link?.href));
  return scalarValue(preferred?.href) || scalarValue(entry?.link) || scalarValue(entry?.url);
};

// This function matches one field only when it is unique among remaining raw and parsed entries.
const matchUniqueValues = (parsedValues, rawValues, matches, usedRawIndexes) => {
  const parsedCounts = new Map();
  const rawIndexesByValue = new Map();

  parsedValues.forEach((value, index) => {
    if (matches[index] !== null || !value) return;
    parsedCounts.set(value, (parsedCounts.get(value) || 0) + 1);
  });
  rawValues.forEach((value, index) => {
    if (usedRawIndexes.has(index) || !value) return;
    const indexes = rawIndexesByValue.get(value) || [];
    indexes.push(index);
    rawIndexesByValue.set(value, indexes);
  });

  parsedValues.forEach((value, parsedIndex) => {
    if (matches[parsedIndex] !== null || !value || parsedCounts.get(value) !== 1) return;
    const rawIndexes = rawIndexesByValue.get(value) || [];
    if (rawIndexes.length !== 1) return;

    matches[parsedIndex] = rawIndexes[0];
    usedRawIndexes.add(rawIndexes[0]);
  });
};

// This function correlates parsed entries with their raw XML elements without relying on position first.
export default function correlateRawEntries(parsedFeed, source) {
  const format = parsedFeed?.format;
  const parsedEntries = parsedFeed?.feed?.entries ?? parsedFeed?.feed?.items;
  const $ = load(String(source), { xmlMode: true });
  const rootElement = $.root().contents().toArray().find(node => (
    node.type === 'tag' && ['rss', 'rdf', 'feed'].includes(localName(node))
  ));
  const feedElement = format === 'rss'
    ? childElements(rootElement, 'channel')[0]
    : rootElement;
  const rawEntries = format === 'rdf'
    ? childElements(rootElement, 'item')
    : childElements(feedElement, format === 'rss' ? 'item' : 'entry');

  if (!Array.isArray(parsedEntries)) {
    return { $, rootElement, feedElement, rawEntriesByParsedIndex: [] };
  }

  const parsedIds = parsedEntries.map(entry => parsedStableId(entry, format));
  const rawIds = rawEntries.map(entry => rawStableId($, entry, format));
  const parsedLinks = parsedEntries.map(entry => parsedLink(entry, format));
  const rawLinks = rawEntries.map(entry => rawLink($, entry, format));
  const matches = parsedEntries.map(() => null);
  const usedRawIndexes = new Set();

  matchUniqueValues(parsedIds, rawIds, matches, usedRawIndexes);
  matchUniqueValues(parsedLinks, rawLinks, matches, usedRawIndexes);

  // Positional fallback is safe only when counts match and identity evidence has not shown reordering.
  const hasUnmatchedIdentityEvidence = matches.some((rawIndex, index) => (
    rawIndex === null && (parsedIds[index] || parsedLinks[index])
  ));
  const positionIsConsistent = parsedEntries.length === rawEntries.length &&
    !hasUnmatchedIdentityEvidence &&
    matches.every((rawIndex, parsedIndex) => rawIndex === null || rawIndex === parsedIndex);
  if (positionIsConsistent) {
    matches.forEach((rawIndex, parsedIndex) => {
      if (rawIndex === null && !usedRawIndexes.has(parsedIndex)) {
        matches[parsedIndex] = parsedIndex;
      }
    });
  }

  return {
    $,
    rootElement,
    feedElement,
    rawEntriesByParsedIndex: matches.map(index => index === null ? null : rawEntries[index])
  };
}
