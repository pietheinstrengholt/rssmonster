// Defines the tracking param names enforced by this service.
const TRACKING_PARAM_NAMES = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_cide',
  'mc_eid',
  'igshid',
  'twclid'
]);

// This function identifies query parameters that should not define article identity.
const isTrackingParam = name => {
  // Normalizes the name before checking tracking param.
  const normalizedName = name.toLowerCase();
  return normalizedName.startsWith('utm_') || TRACKING_PARAM_NAMES.has(normalizedName);
};

// This function normalizes URLs for stable article identity while preserving meaningful query params.
export default function normalizeUrl(url) {
  try {
    // Derives the parsed url required while normalizing url.
    const parsedUrl = new URL(url);

    parsedUrl.protocol = parsedUrl.protocol.toLowerCase();
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
    parsedUrl.hash = '';

    // Processes each entry entry in turn.
    for (const name of [...parsedUrl.searchParams.keys()]) {
      // Handles the case where name is tracking param.
      if (isTrackingParam(name)) {
        parsedUrl.searchParams.delete(name);
      }
    }

    // Handles the case where parsed url pathname is not /.
    if (parsedUrl.pathname !== '/') {
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    }

    // Derives the normalized through to string while normalizing url.
    let normalized = parsedUrl.toString();
    // Handles the case where ends with succeeds.
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return url;
  }
}
