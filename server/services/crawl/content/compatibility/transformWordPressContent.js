import { load } from 'cheerio';

const EMBED_SHORTCODE_PATTERN = /\[embed\]([\s\S]*?)\[\/embed\]/gi;
const CAPTION_BLOCK_PATTERN = /\[caption\b([^\]]*)\]([\s\S]*?)\[\/caption\]/gi;
const CAPTION_OPEN_SHORTCODE_PATTERN = /\[caption\b[^\]]*\]/gi;
const CAPTION_CLOSE_SHORTCODE_PATTERN = /\[\/caption\]/gi;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SAFE_CAPTION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;
const RESPONSIVE_DESCRIPTOR_PATTERN = /^(.*?)(?:\s+|(?:%20)+)((?:[1-9]\d*)w|(?:\d+(?:\.\d+)?|\.\d+)x)\s*$/i;
const URL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const MAX_SMILEY_ALT_LENGTH = 16;

// This function normalizes visible WordPress text without interpreting markup.
function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// This function extracts a strictly validated YouTube video ID from supported URLs.
function youtubeVideoIdFromUrl(value = '') {
  try {
    const parsed = new URL(String(value).trim());
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;

    if (hostname === 'youtu.be') {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length === 1) videoId = pathParts[0];
    } else if (hostname === 'youtube.com' && parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    }

    return YOUTUBE_VIDEO_ID_PATTERN.test(String(videoId || '')) ? videoId : null;
  } catch {
    return null;
  }
}

// This function converts supported embed shortcodes into safe fallback links.
function replaceKnownEmbeds(html = '') {
  return String(html).replace(EMBED_SHORTCODE_PATTERN, (match, embedUrl) => {
    const videoId = youtubeVideoIdFromUrl(embedUrl);
    if (!videoId) return match;

    return '<figure class="embed embed-youtube">' +
      `<a href="https://youtu.be/${videoId}">Watch on YouTube</a></figure>`;
  });
}

// This function extracts a safe optional caption identifier without copying other attributes.
function safeCaptionId(attributes = '') {
  const match = String(attributes).match(
    /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/i
  );
  const value = match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
  return SAFE_CAPTION_ID_PATTERN.test(value) ? value : null;
}

// This function checks whether a link contains only the selected caption image.
function isImageOnlyLink($, link, image) {
  return link.is('a') &&
    link.find('img').length === 1 &&
    link.contents().toArray().every(child => (
      child === image[0] || (child.type === 'text' && !$(child).text().trim())
    ));
}

// This function converts one unambiguous WordPress caption body into semantic markup.
function semanticCaption(attributes, innerHtml) {
  if (/\[\/?caption\b/i.test(innerHtml)) return innerHtml;

  try {
    const $ = load(innerHtml, { xml: { xmlMode: false } }, false);
    const images = $('img').toArray();
    if (images.length !== 1) return innerHtml;

    const image = $(images[0]);
    const parent = image.parent();
    const media = isImageOnlyLink($, parent, image) ? parent : image;
    const mediaHtml = $.html(media);
    media.remove();

    const captionText = normalizedText($.root().text());
    const captionHtml = captionText ? $.root().html().trim() : '';
    const captionId = safeCaptionId(attributes);
    const idAttribute = captionId ? ` id="${captionId}"` : '';

    return `<figure class="wp-caption"${idAttribute}>${mediaHtml}` +
      `${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}</figure>`;
  } catch {
    return innerHtml;
  }
}

// This function converts paired caption shortcodes and safely unwraps malformed markers.
function replaceCaptionShortcodes(html = '') {
  return String(html)
    .replace(CAPTION_BLOCK_PATTERN, (_match, attributes, innerHtml) => (
      semanticCaption(attributes, innerHtml)
    ))
    .replace(CAPTION_OPEN_SHORTCODE_PATTERN, '')
    .replace(CAPTION_CLOSE_SHORTCODE_PATTERN, '');
}

// This function checks whether alt text is a short Unicode symbol rather than a description.
function readableSmileyAlt(value) {
  const alt = normalizedText(value);
  if (!alt || Array.from(alt).length > MAX_SMILEY_ALT_LENGTH || /\p{L}/u.test(alt)) {
    return null;
  }

  const containsUnicodeSymbol = Array.from(alt).some(character => (
    character.codePointAt(0) > 127 && /[\p{Extended_Pictographic}\p{S}]/u.test(character)
  ));

  return containsUnicodeSymbol ? alt : null;
}

// This function replaces trustworthy WordPress smiley images with safe text nodes.
function transformSmileys($) {
  $('img.wp-smiley[alt]').each((_, el) => {
    const node = $(el);
    const alt = readableSmileyAlt(node.attr('alt'));
    if (!alt) return;

    node.replaceWith($('<span></span>').text(alt).contents());
  });
}

// This function checks whether a responsive-image candidate URL uses a safe URL form.
function safeResponsiveImageUrl(value) {
  const url = String(value || '').trim();
  if (!url || /[\u0000-\u0020\\]/.test(url)) return null;

  const scheme = url.match(URL_SCHEME_PATTERN)?.[1]?.toLowerCase();
  if (scheme && !['http', 'https'].includes(scheme)) return null;

  try {
    if (scheme) new URL(url);
    if (url.startsWith('//')) new URL(`https:${url}`);
    return url;
  } catch {
    return null;
  }
}

// This function parses a clearly delimited responsive-image list and selects its first safe URL.
function responsiveImageUrl(value) {
  const rawValue = String(value || '');
  const parts = rawValue.split(/,|%2c/gi);
  if (parts.length < 2) return null;

  const candidates = parts.map(part => {
    const normalizedPart = part.replace(/^(?:\s|%20)+/gi, '');
    const match = normalizedPart.match(RESPONSIVE_DESCRIPTOR_PATTERN);
    if (!match || Number.parseFloat(match[2]) <= 0) return null;
    return { url: match[1].trim(), descriptor: match[2] };
  });

  if (candidates.some(candidate => candidate === null)) return null;
  return candidates.map(candidate => safeResponsiveImageUrl(candidate.url)).find(Boolean) || null;
}

// This function repairs WordPress responsive candidate lists stored incorrectly in image sources.
function transformResponsiveImageSources($) {
  $('img[src]').each((_, el) => {
    const node = $(el);
    const repairedUrl = responsiveImageUrl(node.attr('src'));
    if (repairedUrl) node.attr('src', repairedUrl);
  });
}

// This function handles WordPress shortcode syntax before HTML parsing.
export const transformWordPressSourceContent = (html = '') => replaceCaptionShortcodes(
  replaceKnownEmbeds(html)
);

// This function applies conservative WordPress-specific DOM compatibility repairs.
export const transformWordPressContent = ($) => {
  transformSmileys($);
  transformResponsiveImageSources($);
};
