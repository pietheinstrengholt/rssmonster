import { load } from 'cheerio';

import selectLeadImage from './selectLeadImage.js';
import { selectBestSrcsetCandidate } from '../content/srcset.js';

// Defines the srcset attr names enforced by this service.
const SRCSET_ATTR_NAMES = ['srcset', 'data-srcset'];
// Defines the image source attr names enforced by this service.
const IMAGE_SOURCE_ATTR_NAMES = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'src'
];
// Defines the max candidates per html fragment enforced by this service.
const MAX_CANDIDATES_PER_HTML_FRAGMENT = 24;

// This function checks whether an image URL is a usable http/https URL.
function normalizeImageUrl(value = '', articleUrl = '') {
  // Returns no result when value is not string.
  if (typeof value !== 'string') return null;

  // Normalizes the trimmed before normalizing image url.
  const trimmed = value.trim();
  // Returns no result when trimmed is unavailable or starts with succeeds.
  if (!trimmed || trimmed.toLowerCase().startsWith('data:')) return null;

  try {
    // Selects the parsed based on whether article url is available.
    const parsed = articleUrl
      ? new URL(trimmed, articleUrl)
      : new URL(trimmed);

    // Selects the result based on whether value contains parsed protocol.
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

// This function parses an integer-like dimension from feed or HTML metadata.
function parseDimension(value) {
  // Derives the match through match while parsing dimension.
  const match = String(value ?? '').match(/\d+/);
  // Selects the result based on whether match is available.
  return match ? Number(match[0]) : null;
}

// This function keeps srcset width and fallback dimensions on one consistent aspect ratio.
function htmlImageDimensions(attrs, responsiveImage) {
  // Parses the dimension while performing html image dimensions.
  const originalWidth = parseDimension(attrs.width);
  // Parses the dimension while performing html image dimensions.
  const originalHeight = parseDimension(attrs.height);
  const responsiveWidth = responsiveImage?.width;

  // Returns early when responsive width is not finite or responsive width is at most value.
  if (!Number.isFinite(responsiveWidth) || responsiveWidth <= 0) {
    return { width: originalWidth, height: originalHeight };
  }

  // Selects the scaled height based on whether original width exceeds value and original height exceeds value.
  const scaledHeight = originalWidth > 0 && originalHeight > 0
    ? Math.round(originalHeight * responsiveWidth / originalWidth)
    : null;

  return { width: responsiveWidth, height: scaledHeight };
}

// This function returns a normalized MIME type when candidate metadata provides one.
function normalizeMimeType(value) {
  // Returns no result when value is not string or trim is unavailable.
  if (typeof value !== 'string' || !value.trim()) return null;
  // Normalizes the mime type before normalizing mime type.
  const mimeType = value.trim().toLowerCase();
  // Selects the result based on whether starts with succeeds.
  return mimeType.startsWith('image/') ? mimeType : null;
}

// This function extracts candidate images from one HTML fragment.
function extractHtmlCandidates(html, articleUrl, source) {
  // Returns an empty result when html is not string or trim is unavailable.
  if (typeof html !== 'string' || !html.trim()) return [];

  // Performs the load operation while extracting html candidates.
  const $ = load(html);
  // Collects the candidates while extracting html candidates.
  const candidates = [];

  // Runs the callback required while extracting html candidates.
  $('img').each((index, el) => {
    // Derives the attrs required while extracting html candidates.
    const attrs = el.attribs || {};
    // Maps source values into the result produced while extracting html candidates.
    const responsiveImage = SRCSET_ATTR_NAMES
      .map((attrName, attrIndex) => ({
        ...selectBestSrcsetCandidate(attrs[attrName], articleUrl),
        attrIndex
      }))
      .filter(candidate => candidate.url)
      .sort((a, b) => b.score - a.score || a.attrIndex - b.attrIndex)[0];
    // Derives the url required while extracting html candidates.
    let url = responsiveImage?.url || null;

    // Handles the case where url is unavailable.
    if (!url) {
      // Processes each image source attr names entry in turn.
      for (const attrName of IMAGE_SOURCE_ATTR_NAMES) {
        url = normalizeImageUrl(attrs[attrName], articleUrl);
        // Stops collecting values when url is available.
        if (url) break;
      }
    }

    // Returns early when url is unavailable.
    if (!url) return;
    // Derives the dimensions through html image dimensions while extracting html candidates.
    const dimensions = htmlImageDimensions(attrs, responsiveImage);

    candidates.push({
      url,
      source,
      position: index,
      width: dimensions.width,
      height: dimensions.height,
      mimeType: normalizeMimeType(attrs.type),
      alt: attrs.alt || attrs.title || null,
      className: [attrs.class, attrs.id].filter(Boolean).join(' ') || null
    });
  });

  return candidates;
}

// This function detects the best article image using feed metadata, cleaned content, and body fallback.
export default async function detectArticleImage({
  entry,
  articleUrl,
  contentHtml,
  content,
  description
} = {}) {
  // Selects the candidates based on whether image candidates is an array.
  const candidates = [
    ...(Array.isArray(entry?.imageCandidates) ? entry.imageCandidates : []),
    ...extractHtmlCandidates(contentHtml, articleUrl, 'cleaned-content')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT),
    ...extractHtmlCandidates(content, articleUrl, 'raw-content')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT),
    ...extractHtmlCandidates(description, articleUrl, 'raw-description')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT)
  ];

  return selectLeadImage(candidates);
}

export {
  extractHtmlCandidates
};
