import sanitizeHtml from 'sanitize-html';

// Lists the presentation classes emitted by RSSMonster's MCP article formatter.
const AGENT_OUTPUT_CLASSES = {
  a: ['article-link'],
  div: [
    'article-card',
    'article-body',
    'article-layout',
    'feedname',
    'article-content-wrapper',
    'article-full-content'
  ],
  h5: ['article-header'],
  span: ['article-published', 'break', 'article-source']
};

// Hardens links opened outside RSSMonster against access to the originating window.
function hardenAgentLink(tagName, attribs) {
  if (attribs.target !== '_blank') return { tagName, attribs };

  return {
    tagName,
    attribs: {
      ...attribs,
      rel: 'noopener noreferrer'
    }
  };
}

// Sanitizes agent-authored HTML before it is returned for client-side rendering.
function sanitizeAgentOutput(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [
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
      'a'
    ],
    allowedAttributes: {
      a: ['class', 'href', 'target', 'rel'],
      div: ['class'],
      h5: ['class'],
      span: ['class'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan']
    },
    allowedClasses: AGENT_OUTPUT_CLASSES,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: {
      a: hardenAgentLink
    }
  });
}

export default sanitizeAgentOutput;
