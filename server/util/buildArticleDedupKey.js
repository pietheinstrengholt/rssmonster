import crypto from 'crypto';

import normalizeUrl from './normalizeUrl.js';

export default function buildArticleDedupKey(url) {
  if (!url) {
    return null;
  }

  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(`url:${normalizedUrl}`)
    .digest('hex');
}