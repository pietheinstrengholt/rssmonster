const VIMEO_CARD_SELECTOR = '.rss-content-card--vimeo, [data-embed-provider="vimeo"]';
const EMBED_WRAPPER_SELECTOR = [
  'figure.wp-block-embed-vimeo',
  'figure.wp-block-embed',
  '.wp-block-embed__wrapper',
  '.embed-vimeo'
].join(',');
const VIDEO_ID_PATTERN = /^\d+$/;
const DIMENSION_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const MAX_DIMENSION = 16384;
const MIN_ASPECT_RATIO = 0.1;
const MAX_ASPECT_RATIO = 10;

// This function parses only explicitly supported numeric Vimeo video URLs.
function parseVimeoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathPattern = hostname === 'player.vimeo.com'
      ? /^\/video\/(\d+)\/?$/
      : /^\/(?:video\/)?(\d+)\/?$/;
    if (!['vimeo.com', 'player.vimeo.com'].includes(hostname)) return null;

    const providerId = url.pathname.match(pathPattern)?.[1];
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
  const rawValue = String(value || '').trim();
  if (!DIMENSION_PATTERN.test(rawValue)) return null;

  const dimension = Number(rawValue);
  return Number.isFinite(dimension) && dimension > 0 && dimension <= MAX_DIMENSION
    ? dimension
    : null;
}

// This function calculates a compact safe aspect ratio from iframe dimensions.
function iframeAspectRatio(iframe) {
  const width = sourceDimension(iframe.attr('width'));
  const height = sourceDimension(iframe.attr('height'));
  if (!width || !height) return null;

  const ratio = width / height;
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) return null;
  return String(Number(ratio.toFixed(4)));
}

// This function builds inert RSSMonster-owned Vimeo markup with no publisher HTML.
function createVimeoCard($, vimeo, aspectRatio = null) {
  const figure = $('<figure></figure>')
    .addClass('rss-content-card rss-content-card--embed rss-content-card--vimeo')
    .attr('data-embed-provider', vimeo.provider)
    .attr('data-embed-id', vimeo.providerId)
    .attr('data-embed-url', vimeo.canonicalUrl)
    .attr('data-embed-player-url', vimeo.playerUrl);

  if (aspectRatio) figure.attr('data-embed-aspect-ratio', aspectRatio);

  const link = $('<a></a>')
    .addClass('rss-content-card__link')
    .attr('href', vimeo.canonicalUrl);
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
  const textVimeo = parseVimeoUrl(normalizedText(wrapper.text()));
  if (textVimeo) return textVimeo;

  const anchors = wrapper.find('a[href]').toArray();
  if (anchors.length !== 1) return null;

  const anchor = $(anchors[0]);
  const anchorVimeo = parseVimeoUrl(anchor.attr('href'));
  if (!anchorVimeo) return null;

  return normalizedText(wrapper.text()) === normalizedText(anchor.text())
    ? anchorVimeo
    : null;
}

// This function checks whether an anchor is an explicit Vimeo thumbnail wrapper.
function isVimeoThumbnailAnchor($, anchor) {
  const images = anchor.children('img').toArray();
  if (images.length !== 1) return false;

  const onlyImage = anchor.contents().toArray().every(child => (
    child === images[0] || (child.type === 'text' && !$(child).text().trim())
  ));
  if (!onlyImage) return false;

  const image = $(images[0]);
  return /vimeo/i.test([
    image.attr('alt'),
    image.attr('title'),
    anchor.attr('title')
  ].filter(Boolean).join(' '));
}

// This function checks whether an anchor label is exactly its Vimeo URL.
function isVimeoUrlOnlyAnchor(anchor, vimeo) {
  const labelVimeo = parseVimeoUrl(normalizedText(anchor.text()));
  return labelVimeo?.providerId === vimeo.providerId;
}

// This function converts supported Vimeo iframes and explicit embed links into inert cards.
export const transformVimeoContent = ($) => {
  let transformedCount = 0;

  for (const el of $('iframe[src]').toArray()) {
    const iframe = $(el);
    if (isCanonicalContext(iframe)) continue;

    const vimeo = parseVimeoUrl(iframe.attr('src'));
    if (!vimeo) continue;

    iframe.replaceWith(createVimeoCard($, vimeo, iframeAspectRatio(iframe)));
    transformedCount += 1;
  }

  for (const el of $(EMBED_WRAPPER_SELECTOR).toArray()) {
    if (!el.parent || !$.contains($.root()[0], el)) continue;

    const wrapper = $(el);
    if (isCanonicalContext(wrapper) || wrapper.find(VIMEO_CARD_SELECTOR).length > 0) continue;

    const vimeo = vimeoFromEmbedWrapper($, wrapper);
    if (!vimeo) continue;

    wrapper.replaceWith(createVimeoCard($, vimeo));
    transformedCount += 1;
  }

  for (const el of $('a[href]').toArray()) {
    if (!el.parent || !$.contains($.root()[0], el)) continue;

    const anchor = $(el);
    if (isCanonicalContext(anchor)) continue;

    const vimeo = parseVimeoUrl(anchor.attr('href'));
    if (!vimeo) continue;
    if (!isVimeoThumbnailAnchor($, anchor) && !isVimeoUrlOnlyAnchor(anchor, vimeo)) continue;

    anchor.replaceWith(createVimeoCard($, vimeo));
    transformedCount += 1;
  }

  return transformedCount;
};
