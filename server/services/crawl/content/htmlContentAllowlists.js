// Defines the allowed tags enforced by this service.
const ALLOWED_TAGS = new Set([
  'article',
  'section',
  'div',
  'p',
  'br',
  'hr',
  'blockquote',
  'pre',
  'code',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'small',
  'span',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
  'img',
  'picture',
  'source',
  'a'
]);

// Defines the global attrs enforced by this service.
const GLOBAL_ATTRS = new Set([
  'title',
  'alt',
  'width',
  'height',
  'aria-label'
]);

// Defines the tag attrs enforced by this service.
const TAG_ATTRS = {
  a: new Set(['class', 'href', 'target', 'rel']),
  div: new Set(['class']),
  figure: new Set([
    'class',
    'data-embed-provider',
    'data-embed-id',
    'data-embed-url',
    'data-embed-player-url',
    'data-embed-aspect-ratio'
  ]),
  img: new Set(['class', 'src', 'srcset', 'sizes', 'loading']),
  p: new Set(['class']),
  source: new Set(['src', 'srcset', 'sizes', 'media', 'type']),
  span: new Set(['class']),
  strong: new Set(['class']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan'])
};

// Defines the tag classes enforced by this service.
const TAG_CLASSES = {
  a: new Set(['rss-content-card__link']),
  div: new Set(['rss-content-card__body']),
  figure: new Set([
    'rss-content-card',
    'rss-content-card--embed',
    'rss-content-card--ghost',
    'rss-content-card--wordpress',
    'rss-content-card--twitter',
    'rss-content-card--instagram',
    'rss-content-card--vimeo'
  ]),
  img: new Set(['rss-content-card__image']),
  p: new Set(['rss-content-card__description']),
  span: new Set([
    'invisible',
    'ellipsis',
    'rss-content-card__meta'
  ]),
  strong: new Set(['rss-content-card__title'])
};

// Defines the url attrs enforced by this service.
const URL_ATTRS = new Set(['href', 'src', 'data-embed-url', 'data-embed-player-url']);

// This function checks whether a content URL attribute uses an allowed URL form.
function isSafeUrl(value = '', attrName = '') {
  // Normalizes the trimmed before checking safe url.
  const trimmed = String(value).trim();
  // Rejects the value when trimmed is unavailable.
  if (!trimmed) return false;

  // Returns early when starts with succeeds or starts with succeeds or starts with succeeds or starts with succeeds.
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }

  try {
    // Derives the parsed required while checking safe url.
    const parsed = new URL(trimmed);
    // Selects the safe protocols based on whether attr name is href.
    const safeProtocols = attrName === 'href'
      ? ['http:', 'https:', 'mailto:', 'tel:']
      : ['http:', 'https:'];
    return safeProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

export {
  ALLOWED_TAGS,
  GLOBAL_ATTRS,
  TAG_ATTRS,
  TAG_CLASSES,
  URL_ATTRS,
  isSafeUrl
};
