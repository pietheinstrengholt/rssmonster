const IMAGE_FIELD_NAMES = ['image', 'banner_image', 'thumbnail'];
const IMAGE_ATTR_NAMES = [
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
  'srcset',
  'data-srcset'
];
const TRACKING_PATTERN = /(?:^|[/?&_.=-])(pixel|tracking|tracker|spacer|blank|transparent|analytics|1x1)(?:[/?&_.=-]|$)/i;

// This function checks whether a URL is an absolute http/https URL.
function isSafeAbsoluteUrl(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('data:')) return false;

  try {
    const parsed = new URL(trimmed);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// This function resolves image URLs against the article URL when possible.
function normalizeImageUrl(value = '', articleUrl = '') {
  if (typeof value !== 'string') return null;

  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('data:')) return null;

  try {
    const parsed = articleUrl
      ? new URL(trimmed, articleUrl)
      : new URL(trimmed);

    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

// This function reads common RSS/JSON Feed image values.
function readImageValue(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;

  return value.url || value.href || value.src || null;
}

// This function extracts attributes from a single HTML tag.
function parseAttributes(tag = '') {
  const attrs = {};
  const attrPattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = attrPattern.exec(tag))) {
    const name = match[1].toLowerCase();
    if (name === 'img') continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
}

// This function returns the largest candidate from a srcset-like attribute.
function pickFromSrcset(value = '') {
  if (typeof value !== 'string' || !value.trim()) return null;

  const candidates = String(value)
    .split(',')
    .map((item, index) => {
      const parts = item.trim().split(/\s+/);
      const descriptor = parts[1] || '';
      const widthMatch = descriptor.match(/^(\d+)w$/i);
      const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/i);

      return {
        url: parts[0],
        score: widthMatch
          ? Number(widthMatch[1])
          : densityMatch
            ? Number(densityMatch[1])
            : 0,
        index
      };
    })
    .filter(candidate => candidate.url);

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.url || null;
}

// This function parses integer-like image dimensions from HTML attributes.
function parseDimension(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

// This function rejects tiny or tracker-like image candidates.
function isLikelyTrackingImage({ url, attrs, width, height }) {
  const markerText = [
    url,
    attrs.alt,
    attrs.title,
    attrs.class,
    attrs.id
  ]
    .filter(Boolean)
    .join(' ');

  if (TRACKING_PATTERN.test(markerText)) return true;
  if (width !== null && height !== null && (width <= 1 || height <= 1)) return true;

  return false;
}

// This function finds the best image candidate inside an HTML string.
function extractFromHtml(html, articleUrl) {
  if (typeof html !== 'string' || !html) return null;

  const imgPattern = /<img\b[^>]*>/gi;
  const candidates = [];
  let match;
  let index = 0;

  while ((match = imgPattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const width = parseDimension(attrs.width);
    const height = parseDimension(attrs.height);

    for (const attrName of IMAGE_ATTR_NAMES) {
      const rawValue = attrs[attrName];
      if (rawValue === undefined) continue;

      const imageUrl = attrName.includes('srcset')
        ? pickFromSrcset(rawValue)
        : rawValue;
      const url = normalizeImageUrl(imageUrl, articleUrl);

      if (
        url &&
        !isLikelyTrackingImage({ url, attrs, width, height })
      ) {
        candidates.push({
          url,
          index,
          score: width !== null && height !== null ? width * height : 0
        });
        break;
      }
    }

    index += 1;
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  return candidates[0]?.url || null;
}

// This function extracts the best safe lead image from feed metadata and HTML.
export default function extractLeadImage({
  entry,
  content,
  description,
  articleUrl,
  existingLeadImage
} = {}) {
  if (isSafeAbsoluteUrl(existingLeadImage)) return existingLeadImage;

  for (const fieldName of IMAGE_FIELD_NAMES) {
    const url = normalizeImageUrl(readImageValue(entry?.[fieldName]), articleUrl);
    if (url && !TRACKING_PATTERN.test(url)) return url;
  }

  return (
    extractFromHtml(content, articleUrl) ||
    extractFromHtml(description, articleUrl) ||
    null
  );
}
