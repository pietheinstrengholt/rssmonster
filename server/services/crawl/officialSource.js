import db from '../../models/index.js';

const { OfficialSource } = db;

// This function normalizes a URL or domain string into a hostname.
export function normalizeSourceHostname(value) {
  const trimmedValue = String(value || '').trim().toLowerCase();
  if (!trimmedValue) return null;

  const withoutWildcard = trimmedValue.replace(/^\*\./, '');

  try {
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
  const normalizedHostname = normalizeSourceHostname(hostname);
  const normalizedDomain = normalizeSourceHostname(sourceDomain);

  if (!normalizedHostname || !normalizedDomain) return false;

  return normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`);
}

// This function resolves official-source metadata for an article URL.
export async function resolveOfficialSourceForArticle(userId, articleUrl) {
  if (!userId || !articleUrl) {
    return {
      isOfficialSource: false,
      officialOrganization: null
    };
  }

  const articleHostname = normalizeSourceHostname(articleUrl);
  if (!articleHostname) {
    return {
      isOfficialSource: false,
      officialOrganization: null
    };
  }

  const sources = await OfficialSource.findAll({
    attributes: ['entity', 'domain'],
    where: {
      userId,
      enabled: true
    },
    raw: true
  });

  const matchingSource = sources
    .filter(source => doesHostnameMatchSourceDomain(articleHostname, source.domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];

  if (!matchingSource) {
    return {
      isOfficialSource: false,
      officialOrganization: null
    };
  }

  return {
    isOfficialSource: true,
    officialOrganization: matchingSource.entity
  };
}
