const FILTER_TOKEN_PATTERN = /^(?:favorite|star|unread|read|clicked|seen|event|island|briefing|developing|eventCount|hot|tag|author|language|sort|limit|quality|freshness|firstSeen):/i;
const DATE_TOKEN_PATTERN = /^@/;

// Extracts only user-visible text intent from the shared article-search expression.
export function parseSearchHighlightTerms(search = '') {
  const terms = [];
  let query = String(search || '');

  query = query.replace(/title:"([^"]+)"/gi, (_, phrase) => {
    if (phrase.trim()) terms.push(phrase.trim());
    return ' ';
  });
  query = query.replace(/(?:author:|@)"[^"]*"/gi, ' ');
  query = query.replace(/"([^"]+)"/g, (_, phrase) => {
    if (phrase.trim()) terms.push(phrase.trim());
    return ' ';
  });

  for (const rawToken of query.match(/[^\s,]+/g) || []) {
    const token = rawToken.replace(/[.,;]+$/, '');
    if (!token || FILTER_TOKEN_PATTERN.test(token) || DATE_TOKEN_PATTERN.test(token)) continue;
    const titleMatch = token.match(/^title:(.+)$/i);
    terms.push((titleMatch?.[1] || token).replace(/^"|"$/g, ''));
  }

  return [...new Set(terms.map(term => term.trim()).filter(Boolean))];
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Splits plain text into safe render segments without converting it to HTML.
export function highlightTextSegments(text = '', terms = []) {
  const value = String(text || '');
  const usableTerms = [...terms]
    .map(term => String(term || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (!value || usableTerms.length === 0) return [{ text: value, highlighted: false }];

  const matcher = new RegExp(`(${usableTerms.map(escapeRegExp).join('|')})`, 'gi');
  return value.split(matcher).filter(Boolean).map(segment => ({
    text: segment,
    highlighted: usableTerms.some(term => term.toLowerCase() === segment.toLowerCase())
  }));
}

// Wraps matches in normalized article HTML by modifying text nodes only.
export function highlightHtmlText(html = '', terms = []) {
  if (!html || terms.length === 0 || typeof DOMParser === 'undefined') return html;

  const document = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = document.body.firstElementChild;
  if (!root) return html;

  const walker = document.createTreeWalker(root, globalThis.NodeFilter?.SHOW_TEXT || 4);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    if (node.parentElement?.closest('script, style, mark.search-highlight')) continue;
    const segments = highlightTextSegments(node.nodeValue, terms);
    if (!segments.some(segment => segment.highlighted)) continue;

    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (!segment.highlighted) {
        fragment.append(document.createTextNode(segment.text));
        continue;
      }
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = segment.text;
      fragment.append(mark);
    }
    node.replaceWith(fragment);
  }

  return root.innerHTML;
}
