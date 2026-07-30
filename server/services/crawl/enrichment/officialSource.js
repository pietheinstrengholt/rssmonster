import db from '../../../models/index.js';

// Provides the shared dependencies used by this service.
const { OfficialSource } = db;

// This function returns empty official-source metadata.
export function createEmptyOfficialSource() {
  return {
    isOfficialSource: false,
    officialOrganization: null
  };
}

// This function normalizes a URL or domain string into a hostname.
export function normalizeSourceHostname(value) {
  // Normalizes the trimmed value before normalizing source hostname.
  const trimmedValue = String(value || '').trim().toLowerCase();
  // Returns no result when trimmed value is unavailable.
  if (!trimmedValue) return null;

  // Derives the without wildcard through replace while normalizing source hostname.
  const withoutWildcard = trimmedValue.replace(/^\*\./, '');

  try {
    // Selects the url based on whether without wildcard contains ://.
    const url = new URL(
      withoutWildcard.includes('://') ? withoutWildcard : `https://${withoutWildcard}`
    );
    return url.hostname.replace(/^www\./, '');
  } catch {
    return withoutWildcard
      .split('/')[0]
      .split(':')[0]
      .replace(/^www\./, '') || null;
  }
}

// This function checks if an article hostname belongs to an official source domain.
export function doesHostnameMatchSourceDomain(hostname, sourceDomain) {
  // Normalizes the hostname before performing does hostname match source domain.
  const normalizedHostname = normalizeSourceHostname(hostname);
  // Normalizes the domain before performing does hostname match source domain.
  const normalizedDomain = normalizeSourceHostname(sourceDomain);

  // Rejects the value when normalized hostname is unavailable or normalized domain is unavailable.
  if (!normalizedHostname || !normalizedDomain) return false;

  return normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`);
}

// This function resolves official-source metadata for an article URL.
export async function resolveOfficialSourceForArticle(userId, articleUrl) {
  // Returns early when user id is unavailable or article url is unavailable.
  if (!userId || !articleUrl) {
    return createEmptyOfficialSource();
  }

  // Normalizes the article hostname before resolving official source for article.
  const articleHostname = normalizeSourceHostname(articleUrl);
  // Returns early when article hostname is unavailable.
  if (!articleHostname) {
    return createEmptyOfficialSource();
  }

  // Loads the sources needed while resolving official source for article.
  const sources = await OfficialSource.findAll({
    attributes: ['entity', 'domain'],
    where: {
      userId,
      enabled: true
    },
    raw: true
  });

  // Filters source values to the entries eligible while resolving official source for article.
  const matchingSource = sources
    .filter(source => doesHostnameMatchSourceDomain(articleHostname, source.domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];

  // Returns early when matching source is unavailable.
  if (!matchingSource) {
    return createEmptyOfficialSource();
  }

  return {
    isOfficialSource: true,
    officialOrganization: matchingSource.entity
  };
}
