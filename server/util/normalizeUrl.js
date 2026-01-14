/**
 * Normalize URLs for consistent comparison.
 * - strips query params & hash
 * - normalizes protocol + hostname
 * - removes trailing slash
 */
export default function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    let normalized = u.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}
