import { load } from 'cheerio';

// This function returns an XML element's namespace-independent local name.
const localName = node => String(node?.name || '').toLowerCase().split(':').pop();

// This function returns direct child elements with one local name.
const childElements = (node, name) => (node?.children || [])
  .filter(child => child.type === 'tag' && localName(child) === name);

// This function reads an xml:base attribute without interpreting it as an article link.
const xmlBase = node => node?.attribs?.['xml:base']?.trim() || null;

// This function preserves feed and entry xml:base values discarded by Feedsmith.
export default function preserveXmlBases(parsedFeed, source) {
  if (!['rss', 'rdf', 'atom'].includes(parsedFeed?.format)) return parsedFeed;

  const $ = load(String(source), { xmlMode: true });
  const rootElement = $.root().contents().toArray().find(node => (
    node.type === 'tag' && ['rss', 'rdf', 'feed'].includes(localName(node))
  ));
  // Returns early when the XML root cannot be correlated with the parsed feed.
  if (!rootElement || !parsedFeed?.feed) return parsedFeed;

  const feedElement = parsedFeed.format === 'rss'
    ? childElements(rootElement, 'channel')[0]
    : rootElement;
  const parsedEntries = parsedFeed.feed.entries ?? parsedFeed.feed.items;
  // Preserves the nearest feed-level base for later resolution against the fetched feed URL.
  parsedFeed.feed.xmlBase = xmlBase(feedElement) || xmlBase(rootElement);
  // Returns early when parsed entries are unavailable.
  if (!Array.isArray(parsedEntries)) return parsedFeed;

  const entryElements = childElements(feedElement, parsedFeed.format === 'rss' ? 'item' : 'entry');
  // RDF items are direct root children and use the item element name.
  const sourceEntries = parsedFeed.format === 'rdf'
    ? childElements(rootElement, 'item')
    : entryElements;
  parsedEntries.forEach((entry, index) => {
    entry.xmlBase = xmlBase(sourceEntries[index]);
  });

  return parsedFeed;
}
