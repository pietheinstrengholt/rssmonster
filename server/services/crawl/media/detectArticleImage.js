import { load } from 'cheerio';

import selectLeadImage from './selectLeadImage.js';
import { selectBestSrcsetCandidate } from '../content/srcset.js';

const SRCSET_ATTR_NAMES = ['srcset', 'data-srcset'];
const IMAGE_SOURCE_ATTR_NAMES = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'src'
];
const MAX_CANDIDATES_PER_HTML_FRAGMENT = 24;

// This function checks whether an image URL is a usable http/https URL.
function normalizeImageUrl(value = '', articleUrl = '') {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
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

// This function parses an integer-like dimension from feed or HTML metadata.
function parseDimension(value) {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

// This function keeps srcset width and fallback dimensions on one consistent aspect ratio.
function htmlImageDimensions(attrs, responsiveImage) {
  const originalWidth = parseDimension(attrs.width);
  const originalHeight = parseDimension(attrs.height);
  const responsiveWidth = responsiveImage?.width;

  if (!Number.isFinite(responsiveWidth) || responsiveWidth <= 0) {
    return { width: originalWidth, height: originalHeight };
  }

  const scaledHeight = originalWidth > 0 && originalHeight > 0
    ? Math.round(originalHeight * responsiveWidth / originalWidth)
    : null;

  return { width: responsiveWidth, height: scaledHeight };
}

// This function returns a normalized MIME type when candidate metadata provides one.
function normalizeMimeType(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const mimeType = value.trim().toLowerCase();
  return mimeType.startsWith('image/') ? mimeType : null;
}

// This function extracts candidate images from one HTML fragment.
function extractHtmlCandidates(html, articleUrl, source) {
  if (typeof html !== 'string' || !html.trim()) return [];

  const $ = load(html);
  const candidates = [];

  $('img').each((index, el) => {
    const attrs = el.attribs || {};
    const responsiveImage = SRCSET_ATTR_NAMES
      .map((attrName, attrIndex) => ({
        ...selectBestSrcsetCandidate(attrs[attrName], articleUrl),
        attrIndex
      }))
      .filter(candidate => candidate.url)
      .sort((a, b) => b.score - a.score || a.attrIndex - b.attrIndex)[0];
    let url = responsiveImage?.url || null;

    if (!url) {
      for (const attrName of IMAGE_SOURCE_ATTR_NAMES) {
        url = normalizeImageUrl(attrs[attrName], articleUrl);
        if (url) break;
      }
    }

    if (!url) return;
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
  const candidates = [
    ...(Array.isArray(entry?.imageCandidates) ? entry.imageCandidates : []),
    ...extractHtmlCandidates(contentHtml, articleUrl, 'content')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT),
    ...extractHtmlCandidates(content, articleUrl, 'content')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT),
    ...extractHtmlCandidates(description, articleUrl, 'description')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT)
  ];

  return selectLeadImage(candidates);
}

export {
  extractHtmlCandidates
};
