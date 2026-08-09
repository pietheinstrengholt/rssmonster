import { createHash } from 'node:crypto';

// Identifies ASCII bytes whose percent-encoded and literal forms are equivalent.
const isUnreservedByte = byte =>
  (byte >= 0x41 && byte <= 0x5a) ||
  (byte >= 0x61 && byte <= 0x7a) ||
  (byte >= 0x30 && byte <= 0x39) ||
  [0x2d, 0x2e, 0x5f, 0x7e].includes(byte);

// Canonicalizes safe percent escapes without decoding reserved URL delimiters.
const normalizePercentEncoding = value => value.replace(
  /%[0-9a-f]{2}/gi,
  escape => {
    const byte = Number.parseInt(escape.slice(1), 16);
    return isUnreservedByte(byte)
      ? String.fromCharCode(byte)
      : `%${escape.slice(1).toUpperCase()}`;
  }
);

// Produces a conservative comparison key that is never used as the fetch URL.
export const normalizeFeedIdentityUrl = input => {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw new TypeError('Feed URL is invalid');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('Feed URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new TypeError('Feed URL credentials are not allowed');
  }

  url.hash = '';
  return normalizePercentEncoding(url.href);
};

// Hashes the full normalized URL so MySQL can enforce exact user-scoped identity.
export const hashFeedIdentityUrl = normalizedUrl => createHash('sha256')
  .update(String(normalizedUrl), 'utf8')
  .digest('hex');

// Builds the persisted comparison identity for one observed feed URL.
export const buildFeedUrlIdentity = input => {
  const normalizedUrl = normalizeFeedIdentityUrl(input);
  return {
    normalizedUrl,
    normalizedUrlHash: hashFeedIdentityUrl(normalizedUrl)
  };
};

export default {
  buildFeedUrlIdentity,
  hashFeedIdentityUrl,
  normalizeFeedIdentityUrl
};
