const ALLOWED_TAGS = new Set([
  'html',
  'head',
  'body',
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

const GLOBAL_ATTRS = new Set([
  'title',
  'alt',
  'width',
  'height',
  'aria-label'
]);

const TAG_ATTRS = {
  a: new Set(['class', 'href', 'target', 'rel']),
  div: new Set(['class']),
  figure: new Set(['class']),
  img: new Set(['class', 'src', 'loading']),
  p: new Set(['class']),
  source: new Set(['src', 'type']),
  span: new Set(['class']),
  strong: new Set(['class']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan'])
};

const TAG_CLASSES = {
  a: new Set(['rss-content-card__link']),
  div: new Set(['rss-content-card__body']),
  figure: new Set([
    'rss-content-card',
    'rss-content-card--ghost',
    'rss-content-card--wordpress',
    'rss-content-card--twitter',
    'rss-content-card--instagram'
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

const URL_ATTRS = new Set(['href', 'src']);

// This function checks whether a URL attribute uses one of the allowed URL forms.
function isSafeUrl(value = '', attrName = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return false;

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
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
