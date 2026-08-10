import correlateRawEntries from './correlateRawEntries.js';

// This function reads an xml:base attribute without interpreting it as an article link.
const xmlBase = node => node?.attribs?.['xml:base']?.trim() || null;

// This function preserves feed and entry xml:base values discarded by Feedsmith.
export default function preserveXmlBases(parsedFeed, source) {
  if (!['rss', 'rdf', 'atom'].includes(parsedFeed?.format)) return parsedFeed;

  const {
    rootElement,
    feedElement,
    rawEntriesByParsedIndex
  } = correlateRawEntries(parsedFeed, source);
  // Returns early when the XML root cannot be correlated with the parsed feed.
  if (!rootElement || !parsedFeed?.feed) return parsedFeed;

  const parsedEntries = parsedFeed.feed.entries ?? parsedFeed.feed.items;
  // Preserves the nearest feed-level base for later resolution against the fetched feed URL.
  parsedFeed.feed.xmlBase = xmlBase(feedElement) || xmlBase(rootElement);
  // Returns early when parsed entries are unavailable.
  if (!Array.isArray(parsedEntries)) return parsedFeed;

  parsedEntries.forEach((entry, index) => {
    entry.xmlBase = xmlBase(rawEntriesByParsedIndex[index]);
  });

  return parsedFeed;
}
