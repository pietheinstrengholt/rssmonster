// This function reads a usable URL string from a parsed feed link value.
const readLinkValue = value => {
  if (typeof value !== 'string') return null;

  const link = value.trim();
  return link || null;
};

// This function selects the canonical article link across supported feed entry shapes.
const resolveArticleLink = entry => {
  const links = [
    ...(Array.isArray(entry?.links) ? entry.links : []),
    ...(Array.isArray(entry?.atom?.links) ? entry.atom.links : [])
  ];
  const alternateLink = links.find(link =>
    readLinkValue(link?.href) && (!link.rel || link.rel === 'alternate')
  );
  const firstValidLink = links.find(link => readLinkValue(link?.href));

  return readLinkValue(alternateLink?.href) ||
    readLinkValue(firstValidLink?.href) ||
    readLinkValue(entry?.link) ||
    readLinkValue(entry?.url) ||
    readLinkValue(entry?.external_url);
};

export default resolveArticleLink;
