// Normalizes URLs for consistent comparison by stripping query strings, hashes, and trailing slashes.
// Invalid URLs are returned unchanged so callers can safely normalize before validation.

// Returns a normalized URL string, or the original value when parsing fails.
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
