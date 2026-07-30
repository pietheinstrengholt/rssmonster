// Defines the vimeo card selector enforced by this service.
const VIMEO_CARD_SELECTOR = '.rss-content-card--vimeo, [data-embed-provider="vimeo"]';
// Defines the embed wrapper selector enforced by this service.
const EMBED_WRAPPER_SELECTOR = [
  'figure.wp-block-embed-vimeo',
  'figure.wp-block-embed',
  '.wp-block-embed__wrapper',
  '.embed-vimeo'
].join(',');
// Defines the video id pattern enforced by this service.
const VIDEO_ID_PATTERN = /^\d+$/;
// Defines the dimension pattern enforced by this service.
const DIMENSION_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
// Defines the max dimension enforced by this service.
const MAX_DIMENSION = 16384;
// Defines the min aspect ratio enforced by this service.
const MIN_ASPECT_RATIO = 0.1;
// Defines the max aspect ratio enforced by this service.
const MAX_ASPECT_RATIO = 10;

// This function parses explicitly supported numeric Vimeo video URLs.
function parseVimeoUrl(value) {
  try {
    // Derives the url required while parsing vimeo url.
    const url = new URL(String(value || '').trim());
    // Returns no result when value does not contain url protocol or url username is available or url password is available.
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }

    // Derives the hostname through replace while parsing vimeo url.
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    // Selects the path pattern based on whether hostname is player.vimeo.com.
    const pathPattern = hostname === 'player.vimeo.com'
      ? /^\/video\/(\d+)\/?$/
      : /^\/(?:video\/)?(\d+)\/?$/;
    // Returns no result when value does not contain hostname.
    if (!['vimeo.com', 'player.vimeo.com'].includes(hostname)) return null;

    const providerId = url.pathname.match(pathPattern)?.[1];
    // Returns no result when string does not match the expected format.
    if (!VIDEO_ID_PATTERN.test(String(providerId || ''))) return null;

    return {
      provider: 'vimeo',
      providerId,
      canonicalUrl: `https://vimeo.com/${providerId}`,
      playerUrl: `https://player.vimeo.com/video/${providerId}`
    };
  } catch {
    return null;
  }
}

// This function returns a bounded positive source dimension or null.
function sourceDimension(value) {
  // Normalizes the raw value before performing source dimension.
  const rawValue = String(value || '').trim();
  // Returns no result when raw value does not match the expected format.
  if (!DIMENSION_PATTERN.test(rawValue)) return null;

  // Coerces the dimension into the representation required while performing source dimension.
  const dimension = Number(rawValue);
  // Selects the result based on whether dimension is finite and dimension exceeds value and dimension is at most max dimension.
  return Number.isFinite(dimension) && dimension > 0 && dimension <= MAX_DIMENSION
    ? dimension
    : null;
}

// This function calculates a compact safe aspect ratio from iframe dimensions.
function iframeAspectRatio(iframe) {
  // Derives the width through source dimension while performing iframe aspect ratio.
  const width = sourceDimension(iframe.attr('width'));
  // Derives the height through source dimension while performing iframe aspect ratio.
  const height = sourceDimension(iframe.attr('height'));
  // Returns no result when width is unavailable or height is unavailable.
  if (!width || !height) return null;

  // Derives the ratio required while performing iframe aspect ratio.
  const ratio = width / height;
  // Returns no result when ratio is below min aspect ratio or ratio exceeds max aspect ratio.
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return null;
  return String(Number(ratio.toFixed(4)));
}

// This function builds inert RSSMonster-owned Vimeo markup with no publisher HTML.
function createVimeoCard($, vimeo, aspectRatio = null) {
  // Derives the figure through attr while creating vimeo card.
  const figure = $('<figure></figure>')
    .addClass('rss-content-card rss-content-card--embed rss-content-card--vimeo')
    .attr('data-embed-provider', vimeo.provider)
    .attr('data-embed-id', vimeo.providerId)
    .attr('data-embed-url', vimeo.canonicalUrl)
    .attr('data-embed-player-url', vimeo.playerUrl);

  // Handles the case where aspect ratio is available.
  if (aspectRatio) figure.attr('data-embed-aspect-ratio', aspectRatio);

  // Derives the link through attr while creating vimeo card.
  const link = $('<a></a>')
    .addClass('rss-content-card__link')
    .attr('href', vimeo.canonicalUrl);
  // Derives the body through add class while creating vimeo card.
  const body = $('<div></div>').addClass('rss-content-card__body');

  body.append($('<strong></strong>').addClass('rss-content-card__title').text('Watch on Vimeo'));
  link.append(body);
  figure.append(link);
  return figure;
}

// This function checks whether a candidate is already protected by canonical card markup.
function isCanonicalContext(node) {
  return node.is(VIMEO_CARD_SELECTOR) ||
    node.closest(`.rss-content-card, ${VIMEO_CARD_SELECTOR}`).length > 0;
}

// This function normalizes visible wrapper text for structural comparisons.
function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// This function extracts Vimeo data when a known wrapper contains only one embed target.
function vimeoFromEmbedWrapper($, wrapper) {
  // Parses the vimeo url while performing vimeo from embed wrapper.
  const textVimeo = parseVimeoUrl(normalizedText(wrapper.text()));
  // Returns early when text vimeo is available.
  if (textVimeo) return textVimeo;

  // Derives the anchors through to array while performing vimeo from embed wrapper.
  const anchors = wrapper.find('a[href]').toArray();
  // Returns no result when anchors count is not 1.
  if (anchors.length !== 1) return null;

  // Derives the anchor through $ while performing vimeo from embed wrapper.
  const anchor = $(anchors[0]);
  // Parses the vimeo url while performing vimeo from embed wrapper.
  const anchorVimeo = parseVimeoUrl(anchor.attr('href'));
  // Returns no result when anchor vimeo is unavailable.
  if (!anchorVimeo) return null;

  // Selects the result based on whether normalized text is normalized text.
  return normalizedText(wrapper.text()) === normalizedText(anchor.text())
    ? anchorVimeo
    : null;
}

// This function checks whether an anchor is an explicit Vimeo thumbnail wrapper.
function isVimeoThumbnailAnchor($, anchor) {
  // Derives the images through to array while checking vimeo thumbnail anchor.
  const images = anchor.children('img').toArray();
  // Rejects the value when images count is not 1.
  if (images.length !== 1) return false;

  // Derives the only image through every while checking vimeo thumbnail anchor.
  const onlyImage = anchor.contents().toArray().every(child => (
    child === images[0] || (child.type === 'text' && !$(child).text().trim())
  ));
  // Rejects the value when only image is unavailable.
  if (!onlyImage) return false;

  // Derives the image through $ while checking vimeo thumbnail anchor.
  const image = $(images[0]);
  return /vimeo/i.test([
    image.attr('alt'),
    image.attr('title'),
    anchor.attr('title')
  ].filter(Boolean).join(' '));
}

// This function checks whether an anchor label is exactly its Vimeo URL.
function isVimeoUrlOnlyAnchor(anchor, vimeo) {
  // Parses the vimeo url while checking vimeo url only anchor.
  const labelVimeo = parseVimeoUrl(normalizedText(anchor.text()));
  return labelVimeo?.providerId === vimeo.providerId;
}

// This function converts supported Vimeo iframes and explicit embed links into inert cards.
export const transformVimeoContent = ($) => {
  let transformedCount = 0;

  // Processes each to array entry in turn.
  for (const el of $('iframe[src]').toArray()) {
    // Derives the iframe through $ while performing transform vimeo content.
    const iframe = $(el);
    // Skips the current entry when iframe is canonical context.
    if (isCanonicalContext(iframe)) continue;

    // Parses the vimeo url while performing transform vimeo content.
    const vimeo = parseVimeoUrl(iframe.attr('src'));
    // Skips the current entry when vimeo is unavailable.
    if (!vimeo) continue;

    iframe.replaceWith(createVimeoCard($, vimeo, iframeAspectRatio(iframe)));
    transformedCount += 1;
  }

  // Processes each to array entry in turn.
  for (const el of $(EMBED_WRAPPER_SELECTOR).toArray()) {
    // Skips the current entry when el parent is unavailable or contains is unavailable.
    if (!el.parent || !$.contains($.root()[0], el)) continue;

    // Derives the wrapper through $ while performing transform vimeo content.
    const wrapper = $(el);
    // Skips the current entry when wrapper is canonical context or find count exceeds value.
    if (isCanonicalContext(wrapper) || wrapper.find(VIMEO_CARD_SELECTOR).length > 0) continue;

    // Derives the vimeo through vimeo from embed wrapper while performing transform vimeo content.
    const vimeo = vimeoFromEmbedWrapper($, wrapper);
    // Skips the current entry when vimeo is unavailable.
    if (!vimeo) continue;

    wrapper.replaceWith(createVimeoCard($, vimeo));
    transformedCount += 1;
  }

  // Processes each to array entry in turn.
  for (const el of $('a[href]').toArray()) {
    // Skips the current entry when el parent is unavailable or contains is unavailable.
    if (!el.parent || !$.contains($.root()[0], el)) continue;

    // Derives the anchor through $ while performing transform vimeo content.
    const anchor = $(el);
    // Skips the current entry when anchor is canonical context.
    if (isCanonicalContext(anchor)) continue;

    // Parses the vimeo url while performing transform vimeo content.
    const vimeo = parseVimeoUrl(anchor.attr('href'));
    // Skips the current entry when vimeo is unavailable.
    if (!vimeo) continue;
    // Skips the current entry when $ is not vimeo thumbnail anchor and anchor is not vimeo url only anchor.
    if (!isVimeoThumbnailAnchor($, anchor) && !isVimeoUrlOnlyAnchor(anchor, vimeo)) continue;

    anchor.replaceWith(createVimeoCard($, vimeo));
    transformedCount += 1;
  }

  return transformedCount;
};
