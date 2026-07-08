const DROP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'meta',
  'link',
  'base',
  'svg',
  'math'
]);

const BOILERPLATE_SELECTORS = [
  // TODO: Make boilerplate removal score-based or context-aware to avoid
  // removing real article content on sites that reuse these generic classes.
  '.share',
  '.sharing',
  '.social',
  '.social-share',
  '.social-sharing',
  '.newsletter',
  '.subscribe',
  '.subscription',
  '.signup',
  '.related',
  '.related-posts',
  '.related-articles',
  '.recommended',
  '.recommendations',
  '.more-stories',
  '.read-more',
  '.advertisement',
  '.advertisements',
  '.ad',
  '.ads',
  '.sponsored',
  '.sponsor',
  '.cookie',
  '.cookies',
  '.consent',
  '.cookie-consent',
  '.author-bio',
  '.comments',
  '.comment-section',
  '#share',
  '#sharing',
  '#social',
  '#newsletter',
  '#subscribe',
  '#related',
  '#recommended',
  '#advertisement',
  '#ads',
  '#comments',
  '#cookie',
  '#consent'
];

const USEFUL_CHILD_SELECTORS = [
  'img',
  'picture',
  'source',
  'table',
  'pre',
  'code',
  'blockquote',
  'ul',
  'ol'
].join(',');

const LAZY_IMAGE_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src'
];

// This function returns the first available lazy image URL.
function firstLazyImageSource(node) {
  for (const attrName of LAZY_IMAGE_ATTRS) {
    const value = node.attr(attrName);
    if (value) return value;
  }

  return null;
}

// This function checks whether an image is a 1x1 or smaller tracking pixel.
function isTrackingPixel(node) {
  const width = Number.parseFloat(node.attr('width'));
  const height = Number.parseFloat(node.attr('height'));

  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width <= 1 &&
    height <= 1;
}

// This function normalizes image elements for article display.
function normalizeImages($) {
  $('img').each((_, el) => {
    const node = $(el);

    if (!node.attr('src')) {
      const lazySrc = firstLazyImageSource(node);
      if (lazySrc) {
        node.attr('src', lazySrc);
      }
    }

    if (!node.attr('src') || isTrackingPixel(node)) {
      node.remove();
      return;
    }

    if (!node.attr('loading')) {
      node.attr('loading', 'lazy');
    }
  });
}

// This function removes wrappers that do not contain text or useful child content.
function removeEmptyWrappers($) {
  $('p, div, span').each((_, el) => {
    const node = $(el);
    const hasText = node
      .contents()
      .filter((__, child) => child.type === 'text' && $(child).text().trim())
      .length > 0;

    if (!hasText && node.find(USEFUL_CHILD_SELECTORS).length === 0) {
      node.remove();
    }
  });
}

// This function cleans feed HTML structure before security sanitization.
function cleanupHtmlContent($) {
  $(Array.from(DROP_TAGS).join(',')).remove();
  $(BOILERPLATE_SELECTORS.join(',')).remove();

  normalizeImages($);

  removeEmptyWrappers($);
}

export default cleanupHtmlContent;
