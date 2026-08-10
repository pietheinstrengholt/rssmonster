import { load } from 'cheerio';

// Defines elements whose contents are not part of the rendered article text.
const HIDDEN_ELEMENTS = new Set([
  'base',
  'canvas',
  'head',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'svg',
  'template',
  'title'
]);

// Defines elements that preserve a paragraph-level boundary in visible text.
const PARAGRAPH_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'main',
  'nav',
  'p',
  'pre',
  'section',
  'summary'
]);

// Defines elements that end one visible line without adding paragraph spacing.
const TRAILING_LINE_ELEMENTS = new Set(['caption', 'li', 'tr']);

// This function reports whether publisher markup explicitly hides one element.
export const isExplicitlyHiddenElement = node => {
  const attributes = node.attribs || {};
  const style = String(attributes.style || '').replace(/\s+/g, '').toLowerCase();

  return attributes.hidden !== undefined ||
    String(attributes['aria-hidden'] || '').trim().toLowerCase() === 'true' ||
    /(?:^|;)display:none(?:!important)?(?:;|$)/.test(style) ||
    /(?:^|;)visibility:hidden(?:!important)?(?:;|$)/.test(style);
};

// This function appends DOM text and semantic boundaries in document order.
const appendVisibleText = (node, chunks, preserveLines = false) => {
  if (node.type === 'text') {
    const text = String(node.data || '').replace(/\r\n?/g, '\n');
    chunks.push(preserveLines ? text : text.replace(/\s+/g, ' '));
    return;
  }

  const name = String(node.name || '').toLowerCase();
  if (HIDDEN_ELEMENTS.has(name) || isExplicitlyHiddenElement(node)) return;

  if (name === 'br') {
    chunks.push('\n');
    return;
  }

  const boundary = PARAGRAPH_ELEMENTS.has(name) ? '\n\n' : '';
  if (boundary) chunks.push(boundary);

  for (const child of node.children || []) {
    appendVisibleText(child, chunks, preserveLines || name === 'pre');
  }

  if (name === 'td' || name === 'th') chunks.push('\t');
  if (TRAILING_LINE_ELEMENTS.has(name)) chunks.push('\n');
  if (boundary) chunks.push(boundary);
};

// This function converts publisher HTML into stable, block-aware visible article text.
export default function htmlToVisibleText(value = '') {
  if (value === null || value === undefined || value === '') return '';

  const $ = load(String(value), null, false);
  const chunks = [];
  for (const node of $.root().contents().toArray()) appendVisibleText(node, chunks);

  return chunks.join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
