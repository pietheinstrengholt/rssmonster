import correlateRawEntries from './correlateRawEntries.js';

// This function returns an XML element's namespace-independent local name.
const localName = node => String(node?.name || '').toLowerCase().split(':').pop();

// This function returns direct child elements with one local name.
const childElements = (node, name) => (node?.children || [])
  .filter(child => child.type === 'tag' && localName(child) === name);

// This function maps an Atom text-construct type to RSSMonster's supported content kinds.
const atomTextConstructKind = node => {
  const type = String(node?.attribs?.type || 'text').trim().toLowerCase();
  return ['html', 'xhtml', 'text/html', 'application/xhtml+xml'].includes(type)
    ? 'html'
    : 'text';
};

// This function preserves Atom content and summary kinds discarded by the feed parser.
export default function preserveContentKinds(parsedFeed, source) {
  if (parsedFeed?.format !== 'atom' || !Array.isArray(parsedFeed?.feed?.entries)) {
    return parsedFeed;
  }

  const { rawEntriesByParsedIndex } = correlateRawEntries(parsedFeed, source);

  parsedFeed.feed.entries.forEach((entry, index) => {
    const entryElement = rawEntriesByParsedIndex[index];
    const contentElement = childElements(entryElement, 'content')[0];
    const summaryElement = childElements(entryElement, 'summary')[0];
    if (contentElement && typeof entry.content === 'string') {
      entry.contentKind = atomTextConstructKind(contentElement);
    }
    if (summaryElement && typeof entry.summary === 'string') {
      entry.summaryKind = atomTextConstructKind(summaryElement);
    }
  });

  return parsedFeed;
}
