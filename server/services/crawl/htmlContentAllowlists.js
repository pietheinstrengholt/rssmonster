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
  'class',
  'title',
  'alt',
  'width',
  'height',
  'aria-label'
]);

const TAG_ATTRS = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'loading']),
  source: new Set(['src', 'type']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan'])
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
  URL_ATTRS,
  isSafeUrl
};
