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
  const normalizedName = name.toLowerCase();
  return normalizedName.startsWith('utm_') || TRACKING_PARAM_NAMES.has(normalizedName);
};

// This function normalizes URLs for stable crawl identity while preserving meaningful query params.
export default function normalizeUrl(url) {
  try {
    const parsedUrl = new URL(url);

    parsedUrl.protocol = parsedUrl.protocol.toLowerCase();
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
    parsedUrl.hash = '';

    for (const name of [...parsedUrl.searchParams.keys()]) {
      if (isTrackingParam(name)) {
        parsedUrl.searchParams.delete(name);
      }
    }

    if (parsedUrl.pathname !== '/') {
      parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    }

    let normalized = parsedUrl.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return url;
  }
}
