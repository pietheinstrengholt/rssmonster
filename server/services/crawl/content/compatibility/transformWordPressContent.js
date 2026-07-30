import { load } from 'cheerio';

// Defines the embed shortcode pattern enforced by this service.
const EMBED_SHORTCODE_PATTERN = /\[embed\]([\s\S]*?)\[\/embed\]/gi;
// Defines the caption block pattern enforced by this service.
const CAPTION_BLOCK_PATTERN = /\[caption\b([^\]]*)\]([\s\S]*?)\[\/caption\]/gi;
// Defines the caption open shortcode pattern enforced by this service.
const CAPTION_OPEN_SHORTCODE_PATTERN = /\[caption\b[^\]]*\]/gi;
// Defines the caption close shortcode pattern enforced by this service.
const CAPTION_CLOSE_SHORTCODE_PATTERN = /\[\/caption\]/gi;
// Defines the youtube video id pattern enforced by this service.
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
// Defines the safe caption id pattern enforced by this service.
const SAFE_CAPTION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]*$/;
// Defines the responsive descriptor pattern enforced by this service.
const RESPONSIVE_DESCRIPTOR_PATTERN = /^(.*?)(?:\s+|(?:%20)+)((?:[1-9]\d*)w|(?:\d+(?:\.\d+)?|\.\d+)x)\s*$/i;
// Defines the url scheme pattern enforced by this service.
const URL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/;
// Defines the max smiley alt length enforced by this service.
const MAX_SMILEY_ALT_LENGTH = 16;

// This function normalizes visible WordPress text without interpreting markup.
function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// This function extracts a strictly validated YouTube video ID from supported URLs.
function youtubeVideoIdFromUrl(value = '') {
  try {
    // Derives the parsed required while performing youtube video id from url.
    const parsed = new URL(String(value).trim());
    // Derives the hostname through replace while performing youtube video id from url.
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;

    // Handles the case where hostname is youtu.be.
    if (hostname === 'youtu.be') {
      // Keeps the path parts entries eligible while performing youtube video id from url.
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      // Handles the case where path parts count is 1.
      if (pathParts.length === 1) videoId = pathParts[0];
    // Handles the case where hostname is youtube.com and parsed pathname is /watch.
    } else if (hostname === 'youtube.com' && parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v');
    }

    // Selects the result based on whether string matches the expected format.
    return YOUTUBE_VIDEO_ID_PATTERN.test(String(videoId || '')) ? videoId : null;
  } catch {
    return null;
  }
}

// This function converts supported embed shortcodes into safe fallback links.
function replaceKnownEmbeds(html = '') {
  // Runs the callback required while performing replace known embeds.
  return String(html).replace(EMBED_SHORTCODE_PATTERN, (match, embedUrl) => {
    // Derives the video id through youtube video id from url while performing replace known embeds.
    const videoId = youtubeVideoIdFromUrl(embedUrl);
    // Returns early when video id is unavailable.
    if (!videoId) return match;

    return '<figure class="embed embed-youtube">' +
      `<a href="https://youtu.be/${videoId}">Watch on YouTube</a></figure>`;
  });
}

// This function extracts a safe optional caption identifier without copying other attributes.
function safeCaptionId(attributes = '') {
  // Derives the match through match while performing safe caption id.
  const match = String(attributes).match(
    /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))/i
  );
  // Selects the value based on whether match is available.
  const value = match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
  // Selects the result based on whether value matches the expected format.
  return SAFE_CAPTION_ID_PATTERN.test(value) ? value : null;
}

// This function checks whether a link contains only the selected caption image.
function isImageOnlyLink($, link, image) {
  // Runs the callback required while checking image only link.
  return link.is('a') &&
    link.find('img').length === 1 &&
    link.contents().toArray().every(child => (
      child === image[0] || (child.type === 'text' && !$(child).text().trim())
    ));
}

// This function converts one unambiguous WordPress caption body into semantic markup.
function semanticCaption(attributes, innerHtml) {
  // Returns early when inner html matches the expected format.
  if (/\[\/?caption\b/i.test(innerHtml)) return innerHtml;

  try {
    // Performs the load operation while performing semantic caption.
    const $ = load(innerHtml, { xml: { xmlMode: false } }, false);
    // Derives the images through to array while performing semantic caption.
    const images = $('img').toArray();
    // Returns early when images count is not 1.
    if (images.length !== 1) return innerHtml;

    // Derives the image through $ while performing semantic caption.
    const image = $(images[0]);
    // Derives the parent through parent while performing semantic caption.
    const parent = image.parent();
    // Selects the media based on whether $ is image only link.
    const media = isImageOnlyLink($, parent, image) ? parent : image;
    // Derives the media html through html while performing semantic caption.
    const mediaHtml = $.html(media);
    media.remove();

    // Normalizes the caption text before performing semantic caption.
    const captionText = normalizedText($.root().text());
    // Selects the caption html based on whether caption text is available.
    const captionHtml = captionText ? $.root().html().trim() : '';
    // Derives the caption id through safe caption id while performing semantic caption.
    const captionId = safeCaptionId(attributes);
    // Selects the id attribute based on whether caption id is available.
    const idAttribute = captionId ? ` id="${captionId}"` : '';

    // Selects the result based on whether caption html is available.
    return `<figure class="wp-caption"${idAttribute}>${mediaHtml}` +
      `${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}</figure>`;
  } catch {
    return innerHtml;
  }
}

// This function converts paired caption shortcodes and safely unwraps malformed markers.
function replaceCaptionShortcodes(html = '') {
  // Runs the callback required while performing replace caption shortcodes.
  return String(html)
    .replace(CAPTION_BLOCK_PATTERN, (_match, attributes, innerHtml) => (
      semanticCaption(attributes, innerHtml)
    ))
    .replace(CAPTION_OPEN_SHORTCODE_PATTERN, '')
    .replace(CAPTION_CLOSE_SHORTCODE_PATTERN, '');
}

// This function checks whether alt text is a short Unicode symbol rather than a description.
function readableSmileyAlt(value) {
  // Normalizes the alt before performing readable smiley alt.
  const alt = normalizedText(value);
  // Returns no result when alt is unavailable or from count exceeds max smiley alt length or alt matches the expected format.
  if (!alt || Array.from(alt).length > MAX_SMILEY_ALT_LENGTH || /\p{L}/u.test(alt)) {
    return null;
  }

  // Derives the contains unicode symbol through some while performing readable smiley alt.
  const containsUnicodeSymbol = Array.from(alt).some(character => (
    character.codePointAt(0) > 127 && /[\p{Extended_Pictographic}\p{S}]/u.test(character)
  ));

  // Selects the result based on whether contains unicode symbol is available.
  return containsUnicodeSymbol ? alt : null;
}

// This function replaces trustworthy WordPress smiley images with safe text nodes.
function transformSmileys($) {
  // Runs the callback required while performing transform smileys.
  $('img.wp-smiley[alt]').each((_, el) => {
    // Derives the node through $ while performing transform smileys.
    const node = $(el);
    // Derives the alt through readable smiley alt while performing transform smileys.
    const alt = readableSmileyAlt(node.attr('alt'));
    // Returns early when alt is unavailable.
    if (!alt) return;

    node.replaceWith($('<span></span>').text(alt).contents());
  });
}

// This function checks whether a responsive-image candidate URL uses a safe URL form.
function safeResponsiveImageUrl(value) {
  // Normalizes the url before performing safe responsive image url.
  const url = String(value || '').trim();
  // Returns no result when url is unavailable or url matches the expected format.
  if (!url || /[\u0000-\u0020\\]/.test(url)) return null;

  // Derives the scheme required while performing safe responsive image url.
  const scheme = url.match(URL_SCHEME_PATTERN)?.[1]?.toLowerCase();
  // Returns no result when scheme is available and value does not contain scheme.
  if (scheme && !['http', 'https'].includes(scheme)) return null;

  try {
    // Handles the case where scheme is available.
    if (scheme) new URL(url);
    // Handles the case where starts with succeeds.
    if (url.startsWith('//')) new URL(`https:${url}`);
    return url;
  } catch {
    return null;
  }
}

// This function parses a clearly delimited responsive-image list and selects its first safe URL.
function responsiveImageUrl(value) {
  // Coerces the raw value into the representation required while performing responsive image url.
  const rawValue = String(value || '');
  // Derives the parts through split while performing responsive image url.
  const parts = rawValue.split(/,|%2c/gi);
  // Returns no result when parts count is below 2.
  if (parts.length < 2) return null;

  // Transforms source values into the candidates required while performing responsive image url.
  const candidates = parts.map(part => {
    // Derives the normalized part through replace while performing responsive image url.
    const normalizedPart = part.replace(/^(?:\s|%20)+/gi, '');
    // Derives the match through match while performing responsive image url.
    const match = normalizedPart.match(RESPONSIVE_DESCRIPTOR_PATTERN);
    // Returns no result when match is unavailable or parse float is at most value.
    if (!match || Number.parseFloat(match[2]) <= 0) return null;
    return { url: match[1].trim(), descriptor: match[2] };
  });

  // Rejects the responsive image when any candidate URL is invalid.
  if (candidates.some(candidate => candidate === null)) return null;
  // Maps source values into the result produced while performing responsive image url.
  return candidates.map(candidate => safeResponsiveImageUrl(candidate.url)).find(Boolean) || null;
}

// This function repairs WordPress responsive candidate lists stored incorrectly in image sources.
function transformResponsiveImageSources($) {
  // Runs the callback required while performing transform responsive image sources.
  $('img[src]').each((_, el) => {
    // Derives the node through $ while performing transform responsive image sources.
    const node = $(el);
    // Derives the repaired url through responsive image url while performing transform responsive image sources.
    const repairedUrl = responsiveImageUrl(node.attr('src'));
    // Handles the case where repaired url is available.
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
