import normalizePublisherCards from './normalizePublisherCards.js';
import { transformMastodonContent } from './compatibility/transformMastodonContent.js';
import { transformRedditContent } from './compatibility/transformRedditContent.js';
import { transformSubstackContent } from './compatibility/transformSubstackContent.js';

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

const EMPTY_WRAPPER_TAGS = new Set(['p', 'div', 'span']);

const MEANINGFUL_CONTENT_TAGS = new Set([
  'img',
  'picture',
  'source',
  'figure',
  'figcaption',
  'audio',
  'video',
  'table',
  'pre',
  'code',
  'blockquote',
  'ul',
  'ol',
  'hr',
  'details',
  'summary'
]);

const LAZY_IMAGE_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-original-src',
  'data-url',
  'data-image',
  'data-flickity-lazyload',
  'data-cfsrc'
];

const LAZY_SRCSET_ATTRS = [
  'data-srcset',
  'data-lazy-srcset',
  'data-original-srcset'
];

const PLACEHOLDER_IMAGE_FILENAMES = new Set([
  'spacer.gif',
  'transparent.gif',
  'blank.gif',
  'pixel.gif',
  '1x1.gif',
  'loading.gif',
  'placeholder.gif',
  'placeholder.png',
  'clear.gif',
  'empty.gif'
]);

// This function returns the first available lazy image URL.
function firstLazyImageSource(node) {
  for (const attrName of LAZY_IMAGE_ATTRS) {
    const value = String(node.attr(attrName) || '').trim();
    if (value) return value;
  }

  return null;
}

// This function returns the first available lazy responsive-image value.
function firstLazySrcset(node) {
  for (const attrName of LAZY_SRCSET_ATTRS) {
    const value = String(node.attr(attrName) || '').trim();
    if (value) return value;
  }

  return null;
}

// This function checks whether an image source is a known publisher placeholder.
function isPlaceholderImageSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('data:image/')) return true;

  const path = normalized.split(/[?#]/, 1)[0];
  const filename = path.split(/[\\/]/).pop();
  return PLACEHOLDER_IMAGE_FILENAMES.has(filename);
}

// This function removes recognized lazy attributes after successful promotion.
function removeLazyAttributes(node, attrNames) {
  for (const attrName of attrNames) node.removeAttr(attrName);
}

// This function recovers a missing or placeholder source from explicit lazy attributes.
function recoverImageSource(node) {
  const currentSource = String(node.attr('src') || '').trim();
  const placeholderSource = isPlaceholderImageSource(currentSource);
  if (currentSource && !placeholderSource) return false;

  const lazySource = firstLazyImageSource(node);
  if (lazySource) {
    node.attr('src', lazySource);
    removeLazyAttributes(node, LAZY_IMAGE_ATTRS);
    return placeholderSource;
  }

  if (placeholderSource) node.removeAttr('src');
  return false;
}

// This function recovers a missing responsive-image value without parsing its candidates.
function recoverSrcset(node) {
  if (String(node.attr('srcset') || '').trim()) return;

  const lazySrcset = firstLazySrcset(node);
  if (!lazySrcset) return;

  node.attr('srcset', lazySrcset);
  removeLazyAttributes(node, LAZY_SRCSET_ATTRS);
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
    const replacedPlaceholder = recoverImageSource(node);
    recoverSrcset(node);

    if (
      replacedPlaceholder &&
      Number.parseFloat(node.attr('width')) <= 1 &&
      Number.parseFloat(node.attr('height')) <= 1
    ) {
      node.removeAttr('width');
      node.removeAttr('height');
    }

    if (
      !node.attr('src') ||
      isPlaceholderImageSource(node.attr('src')) ||
      isTrackingPixel(node)
    ) {
      node.remove();
      return;
    }

    if (!node.attr('loading')) {
      node.attr('loading', 'lazy');
    }
  });
}

// This function recovers lazy source and responsive-image values inside pictures.
function normalizePictureSources($) {
  $('picture source').each((_, el) => {
    const node = $(el);
    recoverImageSource(node);
    recoverSrcset(node);
  });
}

// This function wraps adjacent orphan list items in unordered lists.
function repairOrphanListItems($) {
  const candidates = $('li')
    .toArray()
    .filter(el => $(el).parents('ul, ol').length === 0);
  const candidateSet = new Set(candidates);

  for (const el of candidates) {
    const node = $(el);
    if (!el.parent || node.parents('ul, ol').length > 0) continue;

    const group = [el];
    let sibling = el.next;

    while (sibling) {
      if (
        sibling.type === 'comment' ||
        (sibling.type === 'text' && !$(sibling).text().trim())
      ) {
        sibling = sibling.next;
        continue;
      }

      if (
        sibling.type === 'tag' &&
        sibling.name === 'li' &&
        candidateSet.has(sibling) &&
        $(sibling).parents('ul, ol').length === 0
      ) {
        group.push(sibling);
        sibling = sibling.next;
        continue;
      }

      break;
    }

    const list = $('<ul></ul>');
    node.before(list);
    list.append(group);
  }
}

// This function unwraps malformed table containers and preserves orphan cells as paragraphs.
function repairOrphanTableElements($) {
  $('thead, tbody, tfoot').each((_, el) => {
    const node = $(el);
    if (node.parents('table').length > 0) return;

    node.before(node.contents());
    node.remove();
  });

  $('tr').each((_, el) => {
    const node = $(el);
    if (node.parents('table').length > 0) return;

    node.before(node.contents());
    node.remove();
  });

  $('td, th').each((_, el) => {
    const node = $(el);
    if (node.parents('table').length > 0) return;

    const paragraph = $('<p></p>');
    paragraph.append(node.contents());
    node.replaceWith(paragraph);
  });
}

// This function checks direct text while ignoring visible whitespace and zero-width clutter.
function hasMeaningfulDirectText(el) {
  return el.children.some(child => (
    child.type === 'text' &&
    child.data.replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff]+/gu, '').length > 0
  ));
}

// This function derives meaningful content from an element and its processed children.
function isMeaningfulElement($, el, meaningfulElements) {
  if (
    MEANINGFUL_CONTENT_TAGS.has(el.name) ||
    $(el).hasClass('rss-content-card') ||
    hasMeaningfulDirectText(el)
  ) {
    return true;
  }

  return el.children.some(child => meaningfulElements.get(child) === true);
}

// This function removes empty wrappers in one bounded deepest-to-shallowest pass.
function removeEmptyWrappers($) {
  const meaningfulElements = new WeakMap();
  const elements = $('*').toArray().reverse();

  for (const el of elements) {
    const meaningful = isMeaningfulElement($, el, meaningfulElements);
    meaningfulElements.set(el, meaningful);

    if (EMPTY_WRAPPER_TAGS.has(el.name) && !meaningful) {
      $(el).remove();
    }
  }
}

// This function cleans feed HTML structure before security sanitization.
function cleanupHtmlContent($) {
  transformSubstackContent($);

  $(Array.from(DROP_TAGS).join(',')).remove();

  transformRedditContent($);
  normalizePublisherCards($);

  $(BOILERPLATE_SELECTORS.join(',')).remove();

  normalizePictureSources($);
  normalizeImages($);
  transformMastodonContent($);

  repairOrphanListItems($);
  repairOrphanTableElements($);

  removeEmptyWrappers($);
}

export default cleanupHtmlContent;
