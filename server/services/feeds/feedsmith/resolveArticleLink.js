// This function reads a usable URL string from a parsed feed link value.
const readLinkValue = value => {
  // Returns no result when value is not string.
  if (typeof value !== 'string') return null;

  // Normalizes the link before performing read link value.
  const link = value.trim();
  return link || null;
};

// This function selects the canonical article link across supported feed entry shapes.
const resolveArticleLink = entry => {
  // Selects the links based on whether links is an array.
  const links = [
    ...(Array.isArray(entry?.links) ? entry.links : []),
    ...(Array.isArray(entry?.atom?.links) ? entry.atom.links : [])
  ];
  // Loads the alternate link needed while resolving article link.
  const alternateLink = links.find(link =>
    readLinkValue(link?.href) && (!link.rel || link.rel === 'alternate')
  );
  // Loads the first valid link needed while resolving article link.
  const firstValidLink = links.find(link => readLinkValue(link?.href));

  return readLinkValue(alternateLink?.href) ||
    readLinkValue(firstValidLink?.href) ||
    readLinkValue(entry?.link) ||
    readLinkValue(entry?.url) ||
    readLinkValue(entry?.external_url);
};

export default resolveArticleLink;
