import { resolveSafeHttpUrl } from './resolveArticleLink.js';

const text = value => typeof value === 'string' ? value.trim() || null : null;

// Keep publisher order and opaque names; a comma in a name is not an author separator.
const normalizePeople = (people, baseUrl) => {
  const seen = new Set();
  return people.flatMap(person => {
    const name = text(typeof person === 'string' ? person : person?.name) || text(person?.email);
    const url = [person?.url, person?.uri, person?.link]
      .map(value => resolveSafeHttpUrl(value, baseUrl)).find(Boolean) || null;
    if (!name && !url) return [];
    const key = JSON.stringify([name, url]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ name, url }];
  });
};

export default function normalizeAuthors(entry, format, feed, entryBase, feedBase) {
  // An explicit native authors list overrides inherited authors, including a URL-only list.
  if (Array.isArray(entry.authors)) return normalizePeople(entry.authors, entryBase);
  const groups = [
    [entry.author, entry.dc?.creator],
    entry.dc?.creators || [],
    entry.atom?.authors || [],
    entry.dcterms?.creators || [],
    [entry.itunes?.author]
  ];
  for (const group of groups) {
    const people = normalizePeople(group, entryBase);
    if (people.length) return people;
  }
  if (format === 'atom' && Array.isArray(entry.source?.authors)) {
    return normalizePeople(entry.source.authors, entryBase);
  }
  if (['atom', 'json'].includes(format) && Array.isArray(feed.authors)) {
    return normalizePeople(feed.authors, feedBase);
  }
  return null;
}
