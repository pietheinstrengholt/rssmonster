import { load } from 'cheerio';

import db from '../../models/index.js';

const { Article } = db;

const FEED_IMAGE_FIELD_NAMES = ['image', 'banner_image', 'thumbnail'];
const IMAGE_ATTR_NAMES = [
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
  'srcset',
  'data-srcset'
];
const BAD_IMAGE_PATTERN = /(?:^|[/?&_.=-])(ad|ads|advert|analytics|avatar|badge|blank|button|favicon|feedburner|icon|logo|pixel|profile|spacer|sprite|tracking|tracker|transparent|widget|1x1)(?:[/?&_.=-]|$)/i;
const TITLE_TOKEN_MIN_LENGTH = 4;
const TOP_IMAGE_LIMIT = 4;
const MAX_SCORED_CANDIDATES = 12;
const DUPLICATE_IMAGE_THRESHOLD = 8;

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

// This function parses an integer-like dimension from an HTML attribute.
function parseDimension(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : null;
}

// This function decides whether the dimensions are too small for an article image.
function isTinyImage(width, height) {
  if (width !== null && width <= 80) return true;
  if (height !== null && height <= 80) return true;
  if (width !== null && height !== null && width * height < 20000) return true;

  return false;
}

// This function catches feed chrome, trackers, icons, and other non-article imagery.
function isBadImageCandidate(candidate) {
  const markerText = [
    candidate.url,
    candidate.alt,
    candidate.title,
    candidate.className,
    candidate.id
  ]
    .filter(Boolean)
    .join(' ');

  if (BAD_IMAGE_PATTERN.test(markerText)) return true;
  return isTinyImage(candidate.width, candidate.height);
}

// This function calculates how close an image ratio is to common article image ratios.
function scoreAspectRatio(width, height) {
  if (!width || !height) return 0;

  const ratio = width / height;
  const targets = [16 / 9, 4 / 3, 3 / 2];
  const nearestDistance = Math.min(...targets.map(target => Math.abs(target - ratio)));

  if (nearestDistance <= 0.15) return 35;
  if (nearestDistance <= 0.35) return 18;
  if (ratio >= 0.7 && ratio <= 2.4) return 8;

  return -25;
}

// This function extracts useful title/entity terms for nearby text matching.
function titleTokens(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= TITLE_TOKEN_MIN_LENGTH);
}

// This function scores whether nearby text relates to the article title.
function scoreNearbyText(text = '', title = '') {
  const tokens = titleTokens(title);
  if (!tokens.length || !text) return 0;

  const normalizedText = text.toLowerCase();
  const matchCount = tokens.filter(token => normalizedText.includes(token)).length;

  return Math.min(matchCount * 12, 36);
}

// This function extracts candidate images from one HTML fragment.
function extractHtmlCandidates(html, articleUrl, source) {
  if (typeof html !== 'string' || !html.trim()) return [];

  const $ = load(html);
  const candidates = [];

  $('img').each((index, el) => {
    const image = $(el);
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

    const candidate = {
      url,
      source,
      index,
      width: parseDimension(attrs.width),
      height: parseDimension(attrs.height),
      alt: attrs.alt || '',
      title: attrs.title || '',
      className: attrs.class || '',
      id: attrs.id || '',
      nearbyText: image.closest('figure, article, section, div, p').text().replace(/\s+/g, ' ').trim()
    };

    if (!isBadImageCandidate(candidate)) {
      candidates.push(candidate);
    }
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

// This function detects the feed-provided featured image before article HTML fallbacks.
function detectFeedProvidedImage(entry = {}, articleUrl = '') {
  const media = entry.media || {};
  const mediaContentImage = mediaContents(media)
    .find(content => {
      const type = String(content?.type || '').toLowerCase();
      const medium = String(content?.medium || '').toLowerCase();

      return content?.url && (type.startsWith('image/') || medium === 'image');
    });
  const mediaContentUrl = normalizeImageUrl(mediaContentImage?.url, articleUrl);
  if (mediaContentUrl && !BAD_IMAGE_PATTERN.test(mediaContentUrl)) return mediaContentUrl;

  const thumbnailUrl = mediaThumbnails(media)
    .map(thumbnail => normalizeImageUrl(thumbnail?.url, articleUrl))
    .find(url => url && !BAD_IMAGE_PATTERN.test(url));
  if (thumbnailUrl) return thumbnailUrl;

  const imageEnclosure = Array.isArray(entry.enclosures)
    ? entry.enclosures.find(enclosure =>
      enclosure?.url &&
        typeof enclosure.type === 'string' &&
        enclosure.type.toLowerCase().startsWith('image/')
    )
    : null;
  const enclosureUrl = normalizeImageUrl(imageEnclosure?.url, articleUrl);
  if (enclosureUrl && !BAD_IMAGE_PATTERN.test(enclosureUrl)) return enclosureUrl;

  for (const fieldName of FEED_IMAGE_FIELD_NAMES) {
    const fieldUrl = normalizeImageUrl(readUrlValue(entry[fieldName]), articleUrl);
    if (fieldUrl && !BAD_IMAGE_PATTERN.test(fieldUrl)) return fieldUrl;
  }

  return null;
}

// This function prefers a meaningful image near the top of cleaned article content.
function detectTopArticleImage(contentStripped, articleUrl) {
  return extractHtmlCandidates(contentStripped, articleUrl, 'contentStripped')
    .slice(0, TOP_IMAGE_LIMIT)
    .find(candidate => !isBadImageCandidate(candidate))
    ?.url || null;
}

// This function counts exact image reuse within the same feed when context is available.
async function countFeedImageReuse(candidate, feed) {
  if (!feed?.id || !feed?.userId || !candidate?.url) return 0;

  return Article.count({
    where: {
      feedId: feed.id,
      userId: feed.userId,
      imageUrl: candidate.url
    }
  });
}

// This function assigns a fallback score to a possible body image.
async function scoreBodyCandidate(candidate, { feed, title }) {
  const area = candidate.width && candidate.height
    ? candidate.width * candidate.height
    : 0;
  const reuseCount = await countFeedImageReuse(candidate, feed);

  let score = 0;
  if (area >= 90000) score += Math.min(area / 10000, 80);
  if (candidate.width && candidate.height) score += scoreAspectRatio(candidate.width, candidate.height);
  score += Math.max(40 - candidate.index * 8, 0);
  score += scoreNearbyText(candidate.nearbyText, title);
  if (reuseCount >= DUPLICATE_IMAGE_THRESHOLD) score -= 70;

  return {
    ...candidate,
    score
  };
}

// This function chooses the best scored image from article body fallback candidates.
async function detectScoredBodyImage({ content, description, articleUrl, feed, title }) {
  const candidates = [
    ...extractHtmlCandidates(content, articleUrl, 'content'),
    ...extractHtmlCandidates(description, articleUrl, 'description')
  ].slice(0, MAX_SCORED_CANDIDATES);

  if (!candidates.length) return null;

  const scoredCandidates = await Promise.all(
    candidates.map(candidate => scoreBodyCandidate(candidate, { feed, title }))
  );

  scoredCandidates.sort((a, b) => b.score - a.score || a.index - b.index);

  return scoredCandidates[0]?.score > 0 ? scoredCandidates[0].url : null;
}

// This function detects the best article image using feed metadata, cleaned content, and body fallback.
export default async function detectArticleImage({
  entry,
  articleUrl,
  contentStripped,
  content,
  description,
  feed,
  title
} = {}) {
  const feedImage = detectFeedProvidedImage(entry, articleUrl);
  if (feedImage) return feedImage;

  const topArticleImage = detectTopArticleImage(contentStripped, articleUrl);
  if (topArticleImage) return topArticleImage;

  return detectScoredBodyImage({
    content,
    description,
    articleUrl,
    feed,
    title
  });
}

export {
  detectFeedProvidedImage,
  detectTopArticleImage,
  detectScoredBodyImage
};
