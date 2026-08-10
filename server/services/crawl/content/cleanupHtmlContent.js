import normalizePublisherCards from './normalizePublisherCards.js';
import { isExplicitlyHiddenElement } from './htmlToVisibleText.js';
import { transformMastodonContent } from './compatibility/transformMastodonContent.js';
import { transformRedditContent } from './compatibility/transformRedditContent.js';
import { transformSubstackContent } from './compatibility/transformSubstackContent.js';
import { transformVimeoContent } from './compatibility/transformVimeoContent.js';
import { parseSrcset } from './srcset.js';

// Defines the drop tags enforced by this service.
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

// Defines the boilerplate selectors enforced by this service.
const BOILERPLATE_SELECTORS = [
  // Generic boilerplate cleanup must remain limited to high-confidence structural selectors.
  // Ambiguous publisher/content semantics should be handled by precise compatibility rules or future multi-signal logic.
  '.social-share',
  '.social-sharing',
  '.advertisement',
  '.advertisements',
  '.cookie-consent',
  '#advertisement'
];

// Defines the empty wrapper tags enforced by this service.
const EMPTY_WRAPPER_TAGS = new Set(['p', 'div', 'span']);

// Defines the meaningful content tags enforced by this service.
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

// Defines the lazy image attrs enforced by this service.
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

// Defines the lazy srcset attrs enforced by this service.
const LAZY_SRCSET_ATTRS = [
  'data-srcset',
  'data-lazy-srcset',
  'data-original-srcset'
];

// Defines the placeholder image filenames enforced by this service.
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

// This function removes explicitly hidden subtrees before sanitization strips visibility metadata.
function removeExplicitlyHiddenContent($) {
  $('*').each((_, el) => {
    if (isExplicitlyHiddenElement(el)) $(el).remove();
  });
}

// This function returns the first available lazy image URL.
function firstLazyImageSource(node) {
  // Processes each lazy image attrs entry in turn.
  for (const attrName of LAZY_IMAGE_ATTRS) {
    // Normalizes the value before performing first lazy image source.
    const value = String(node.attr(attrName) || '').trim();
    // Returns the first non-empty lazy image URL.
    if (value) return value;
  }

  return null;
}

// This function returns the first available lazy responsive-image value.
function firstLazySrcset(node) {
  // Processes each lazy srcset attrs entry in turn.
  for (const attrName of LAZY_SRCSET_ATTRS) {
    // Normalizes the value before performing first lazy srcset.
    const value = String(node.attr(attrName) || '').trim();
    // Returns the first non-empty lazy responsive-image value.
    if (value) return value;
  }

  return null;
}

// This function returns the first usable URL from a responsive-image candidate list.
function firstSrcsetSource(value) {
  return parseSrcset(value)[0]?.url || null;
}

// This function checks whether an image source is a known publisher placeholder.
function isPlaceholderImageSource(value) {
  // Normalizes the normalized before checking placeholder image source.
  const normalized = String(value || '').trim().toLowerCase();
  // Rejects the value when normalized is unavailable.
  if (!normalized) return false;
  // Returns early when starts with succeeds.
  if (normalized.startsWith('data:image/')) return true;

  const path = normalized.split(/[?#]/, 1)[0];
  // Derives the filename through pop while checking placeholder image source.
  const filename = path.split(/[\\/]/).pop();
  return PLACEHOLDER_IMAGE_FILENAMES.has(filename);
}

// This function removes recognized lazy attributes after successful promotion.
function removeLazyAttributes(node, attrNames) {
  // Processes each attr names entry in turn.
  for (const attrName of attrNames) node.removeAttr(attrName);
}

// This function recovers a missing or placeholder source from explicit lazy attributes.
function recoverImageSource(node) {
  // Normalizes the current source before performing recover image source.
  const currentSource = String(node.attr('src') || '').trim();
  // Derives the placeholder source through is placeholder image source while performing recover image source.
  const placeholderSource = isPlaceholderImageSource(currentSource);
  // Rejects the value when current source is available and placeholder source is unavailable.
  if (currentSource && !placeholderSource) return false;

  // Derives the lazy source through first lazy image source while performing recover image source.
  const lazySource = firstLazyImageSource(node);
  // Derives the responsive source through first srcset source while performing recover image source.
  const responsiveSource = firstSrcsetSource(
    node.attr('srcset') || firstLazySrcset(node)
  );
  // Derives the recovered source required while performing recover image source.
  const recoveredSource = lazySource || responsiveSource;

  // Handles the case where recovered source is available.
  if (recoveredSource) {
    node.attr('src', recoveredSource);
    // Handles the case where lazy source is available.
    if (lazySource) removeLazyAttributes(node, LAZY_IMAGE_ATTRS);
    return placeholderSource;
  }

  // Handles the case where placeholder source is available.
  if (placeholderSource) node.removeAttr('src');
  return false;
}

// This function recovers image sources before publisher wrappers replace their original DOM.
function recoverImageSources($) {
  // Runs the callback required while performing recover image sources.
  $('img').each((_, el) => {
    // Derives the node through $ while performing recover image sources.
    const node = $(el);
    // Derives the replaced placeholder through recover image source while performing recover image sources.
    const replacedPlaceholder = recoverImageSource(node);
    recoverSrcset(node);

    // Handles the case where replaced placeholder is available and parse float is at most 1 and parse float is at most 1.
    if (
      replacedPlaceholder &&
      Number.parseFloat(node.attr('width')) <= 1 &&
      Number.parseFloat(node.attr('height')) <= 1
    ) {
      node.removeAttr('width');
      node.removeAttr('height');
    }
  });
}

// This function recovers a missing responsive-image value without parsing its candidates.
function recoverSrcset(node) {
  // Returns early when trim succeeds.
  if (String(node.attr('srcset') || '').trim()) return;

  // Derives the lazy srcset through first lazy srcset while performing recover srcset.
  const lazySrcset = firstLazySrcset(node);
  // Returns early when lazy srcset is unavailable.
  if (!lazySrcset) return;

  node.attr('srcset', lazySrcset);
  removeLazyAttributes(node, LAZY_SRCSET_ATTRS);
}

// This function checks whether an image is a 1x1 or smaller tracking pixel.
function isTrackingPixel(node) {
  // Parses the float while checking tracking pixel.
  const width = Number.parseFloat(node.attr('width'));
  // Parses the float while checking tracking pixel.
  const height = Number.parseFloat(node.attr('height'));

  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width <= 1 &&
    height <= 1;
}

// This function normalizes image elements for article display.
function normalizeImages($) {
  // Runs the callback required while normalizing images.
  $('img').each((_, el) => {
    // Derives the node through $ while normalizing images.
    const node = $(el);

    // Handles the case where attr is unavailable or attr is placeholder image source or node is tracking pixel.
    if (
      !node.attr('src') ||
      isPlaceholderImageSource(node.attr('src')) ||
      isTrackingPixel(node)
    ) {
      node.remove();
      return;
    }

    // Handles the case where attr is unavailable.
    if (!node.attr('loading')) {
      node.attr('loading', 'lazy');
    }
  });
}

// This function recovers lazy source and responsive-image values inside pictures.
function normalizePictureSources($) {
  // Runs the callback required while normalizing picture sources.
  $('picture source').each((_, el) => {
    // Derives the node through $ while normalizing picture sources.
    const node = $(el);
    recoverImageSource(node);
    recoverSrcset(node);
  });
}

// This function wraps adjacent orphan list items in unordered lists.
function repairOrphanListItems($) {
  // Keeps the candidates entries eligible while performing repair orphan list items.
  const candidates = $('li')
    .toArray()
    .filter(el => $(el).parents('ul, ol').length === 0);
  // Tracks distinct candidate set while performing repair orphan list items.
  const candidateSet = new Set(candidates);

  // Processes each candidates entry in turn.
  for (const el of candidates) {
    // Derives the node through $ while performing repair orphan list items.
    const node = $(el);
    // Skips the current entry when el parent is unavailable or parents count exceeds value.
    if (!el.parent || node.parents('ul, ol').length > 0) continue;

    // Collects the group while performing repair orphan list items.
    const group = [el];
    let sibling = el.next;

    // Repeats this processing step while eligible work remains.
    while (sibling) {
      // Handles the case where sibling type is comment or sibling type is text and trim is unavailable.
      if (
        sibling.type === 'comment' ||
        (sibling.type === 'text' && !$(sibling).text().trim())
      ) {
        sibling = sibling.next;
        continue;
      }

      // Handles the case where sibling type is tag and sibling name is li and candidate set contains sibling and parents count is value.
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

    // Derives the list through $ while performing repair orphan list items.
    const list = $('<ul></ul>');
    node.before(list);
    list.append(group);
  }
}

// This function unwraps malformed table containers and preserves orphan cells as paragraphs.
function repairOrphanTableElements($) {
  // Runs the callback required while performing repair orphan table elements.
  $('thead, tbody, tfoot').each((_, el) => {
    // Derives the node through $ while performing repair orphan table elements.
    const node = $(el);
    // Returns early when parents count exceeds value.
    if (node.parents('table').length > 0) return;

    node.before(node.contents());
    node.remove();
  });

  // Runs the callback required while performing repair orphan table elements.
  $('tr').each((_, el) => {
    // Derives the node through $ while performing repair orphan table elements.
    const node = $(el);
    // Returns early when parents count exceeds value.
    if (node.parents('table').length > 0) return;

    node.before(node.contents());
    node.remove();
  });

  // Runs the callback required while performing repair orphan table elements.
  $('td, th').each((_, el) => {
    // Derives the node through $ while performing repair orphan table elements.
    const node = $(el);
    // Returns early when parents count exceeds value.
    if (node.parents('table').length > 0) return;

    // Derives the paragraph through $ while performing repair orphan table elements.
    const paragraph = $('<p></p>');
    paragraph.append(node.contents());
    node.replaceWith(paragraph);
  });
}

// This function checks direct text while ignoring visible whitespace and zero-width clutter.
function hasMeaningfulDirectText(el) {
  // Checks candidate values while checking meaningful direct text.
  return el.children.some(child => (
    child.type === 'text' &&
    child.data.replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff]+/gu, '').length > 0
  ));
}

// This function derives meaningful content from an element and its processed children.
function isMeaningfulElement($, el, meaningfulElements) {
  // Returns early when meaningful content tags contains el name or has class succeeds or has meaningful direct text succeeds.
  if (
    MEANINGFUL_CONTENT_TAGS.has(el.name) ||
    $(el).hasClass('rss-content-card') ||
    hasMeaningfulDirectText(el)
  ) {
    return true;
  }

  // Checks candidate values while checking meaningful element.
  return el.children.some(child => meaningfulElements.get(child) === true);
}

// This function removes empty wrappers in one bounded deepest-to-shallowest pass.
function removeEmptyWrappers($) {
  // Derives the meaningful elements required while performing remove empty wrappers.
  const meaningfulElements = new WeakMap();
  // Derives the elements through reverse while performing remove empty wrappers.
  const elements = $('*').toArray().reverse();

  // Processes each elements entry in turn.
  for (const el of elements) {
    // Derives the meaningful through is meaningful element while performing remove empty wrappers.
    const meaningful = isMeaningfulElement($, el, meaningfulElements);
    meaningfulElements.set(el, meaningful);

    // Handles the case where empty wrapper tags contains el name and meaningful is unavailable.
    if (EMPTY_WRAPPER_TAGS.has(el.name) && !meaningful) {
      $(el).remove();
    }
  }
}

// This function prepares publisher HTML while it still has its original structure.
function prepareHtmlContent($) {
  transformSubstackContent($);
  removeExplicitlyHiddenContent($);
  recoverImageSources($);
  transformVimeoContent($);

  $(Array.from(DROP_TAGS).join(',')).remove();

  transformRedditContent($);
}

// This function finishes cleanup after embedded URLs have been normalized.
function finalizeHtmlContent($) {
  normalizePublisherCards($);

  $(BOILERPLATE_SELECTORS.join(',')).remove();

  normalizePictureSources($);
  normalizeImages($);
  transformMastodonContent($);

  repairOrphanListItems($);
  repairOrphanTableElements($);

  removeEmptyWrappers($);
}

// This function preserves the complete cleanup API for callers without a URL base.
function cleanupHtmlContent($) {
  prepareHtmlContent($);
  finalizeHtmlContent($);
}

export { finalizeHtmlContent, prepareHtmlContent };
export default cleanupHtmlContent;
