import { load } from 'cheerio';

import selectLeadImage from './selectLeadImage.js';

const FEED_IMAGE_FIELD_NAMES = ['image', 'banner_image', 'thumbnail'];
const IMAGE_ATTR_NAMES = [
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
  'srcset',
  'data-srcset'
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

// This function reads common URL shapes from feed image objects.
function readUrlValue(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;

  return value.url || value.href || value.src || null;
}

// This function returns the strongest URL from a srcset-like value.
function pickFromSrcset(value = '') {
  if (typeof value !== 'string' || !value.trim()) return null;

  const candidates = value
    .split(',')
    .map((item, index) => {
      const [url, descriptor = ''] = item.trim().split(/\s+/);
      const widthMatch = descriptor.match(/^(\d+)w$/i);
      const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/i);

      return {
        url,
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

// This function parses an integer-like dimension from feed or HTML metadata.
function parseDimension(value) {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

// This function returns a normalized MIME type when feed metadata provides one.
function normalizeMimeType(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const mimeType = value.trim().toLowerCase();
  return mimeType.startsWith('image/') ? mimeType : null;
}

// This function normalizes one discovered feed image into a selection candidate.
function createFeedCandidate(value, articleUrl, source, mimeType = null) {
  const url = normalizeImageUrl(readUrlValue(value), articleUrl);
  if (!url) return null;

  const metadata = value && typeof value === 'object' ? value : {};

  return {
    url,
    width: parseDimension(metadata.width),
    height: parseDimension(metadata.height),
    mimeType: normalizeMimeType(mimeType || metadata.type || metadata.mimeType),
    source,
    position: null,
    alt: typeof metadata.alt === 'string' ? metadata.alt : null,
    className: null
  };
}

// This function extracts candidate images from one HTML fragment.
function extractHtmlCandidates(html, articleUrl, source) {
  if (typeof html !== 'string' || !html.trim()) return [];

  const $ = load(html);
  const candidates = [];

  $('img').each((index, el) => {
    const attrs = el.attribs || {};
    let rawUrl = null;

    for (const attrName of IMAGE_ATTR_NAMES) {
      const rawValue = attrs[attrName];
      if (rawValue === undefined) continue;

      rawUrl = attrName.includes('srcset')
        ? pickFromSrcset(rawValue)
        : rawValue;
      if (rawUrl) break;
    }

    const url = normalizeImageUrl(rawUrl, articleUrl);
    if (!url) return;

    candidates.push({
      url,
      source,
      position: index,
      width: parseDimension(attrs.width),
      height: parseDimension(attrs.height),
      mimeType: normalizeMimeType(attrs.type),
      alt: attrs.alt || attrs.title || null,
      className: [attrs.class, attrs.id].filter(Boolean).join(' ') || null
    });
  });

  return candidates;
}

// This function returns nested FeedSmit media:content items.
function mediaContents(media = {}) {
  return [
    ...(Array.isArray(media.contents) ? media.contents : []),
    ...(Array.isArray(media.group?.contents) ? media.group.contents : []),
    ...(Array.isArray(media.groups)
      ? media.groups.flatMap(group => Array.isArray(group.contents) ? group.contents : [])
      : [])
  ];
}

// This function returns nested FeedSmit media:thumbnail items.
function mediaThumbnails(media = {}) {
  const contentThumbnails = mediaContents(media)
    .flatMap(content => Array.isArray(content.thumbnails) ? content.thumbnails : []);

  return [
    ...(Array.isArray(media.thumbnails) ? media.thumbnails : []),
    ...(Array.isArray(media.group?.thumbnails) ? media.group.thumbnails : []),
    ...(Array.isArray(media.groups)
      ? media.groups.flatMap(group => Array.isArray(group.thumbnails) ? group.thumbnails : [])
      : []),
    ...contentThumbnails
  ];
}

// This function discovers feed-provided image candidates in the existing source order.
function detectFeedProvidedImages(entry = {}, articleUrl = '') {
  const media = entry.media || {};
  const candidates = [];

  mediaContents(media).forEach(content => {
    const type = normalizeMimeType(content?.type);
    const medium = String(content?.medium || '').toLowerCase();
    if (!type && medium !== 'image') return;

    const candidate = createFeedCandidate(content, articleUrl, 'media-content', type);
    if (candidate) candidates.push(candidate);
  });

  mediaThumbnails(media).forEach(thumbnail => {
    const candidate = createFeedCandidate(thumbnail, articleUrl, 'media-thumbnail');
    if (candidate) candidates.push(candidate);
  });

  if (Array.isArray(entry.enclosures)) {
    entry.enclosures.forEach(enclosure => {
      const type = normalizeMimeType(enclosure?.type);
      if (!type) return;

      const candidate = createFeedCandidate(enclosure, articleUrl, 'enclosure', type);
      if (candidate) candidates.push(candidate);
    });
  }

  for (const fieldName of FEED_IMAGE_FIELD_NAMES) {
    const candidate = createFeedCandidate(entry[fieldName], articleUrl, 'publisher');
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

// This function detects the best article image using feed metadata, cleaned content, and body fallback.
export default async function detectArticleImage({
  entry,
  articleUrl,
  contentStripped,
  content,
  description
} = {}) {
  const candidates = [
    ...detectFeedProvidedImages(entry, articleUrl),
    ...extractHtmlCandidates(contentStripped, articleUrl, 'content')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT),
    ...extractHtmlCandidates(content, articleUrl, 'content')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT),
    ...extractHtmlCandidates(description, articleUrl, 'description')
      .slice(0, MAX_CANDIDATES_PER_HTML_FRAGMENT)
  ];

  return selectLeadImage(candidates);
}

export {
  detectFeedProvidedImages,
  extractHtmlCandidates
};
