const MEDIA_URL_PATTERN = /<(?:img|source|video|audio|iframe|embed|object)\b[^>]*\s(?:src|srcset|data)\s*=\s*["']([^"']+)["']/gi;
const VECTOR_ELEMENT_PATTERN = /<(?:svg|canvas)\b/i;
const NULL_ARTICLE_CONTENT = '<html><head></head><body>null</body></html>';

// Returns whether HTML or plain text contains visible text or renderable media.
export function hasRenderableContent(value) {
  const content = String(value || '');
  if (!content.trim()) return false;
  if (content.trim().toLowerCase() === NULL_ARTICLE_CONTENT) return false;

  if (typeof DOMParser !== 'undefined') {
    try {
      const document = new DOMParser().parseFromString(content, 'text/html');
      const text = String(document.body?.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (text) return true;

      const renderableElements = document.body?.querySelectorAll('img, source, video, audio, iframe, embed, object, svg, canvas') || [];
      return Array.from(renderableElements).some(element => {
        if (['svg', 'canvas'].includes(element.tagName.toLowerCase())) return true;

        return ['src', 'srcset', 'data'].some(attribute => {
          const candidates = String(element.getAttribute(attribute) || '')
            .split(',')
            .map(candidate => candidate.trim().split(/\s+/)[0]);
          return candidates.some(usableHttpUrl);
        });
      });
    } catch {
      // Fall through to string checks when parsing is unavailable.
    }
  }

  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasUsableMedia = Array.from(content.matchAll(MEDIA_URL_PATTERN))
    .some(match => match[1].split(',').some(candidate => usableHttpUrl(candidate.trim().split(/\s+/)[0])));

  return Boolean(text || hasUsableMedia || VECTOR_ELEMENT_PATTERN.test(content));
}

// Returns a canonical HTTP(S) URL, or an empty string for unusable values.
export function usableHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}
