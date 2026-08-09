import { normalizeSrcset } from './srcset.js';

// Defines the url attributes enforced by this service.
const URL_ATTRIBUTES = [
  { selector: 'a[href]', attribute: 'href', link: true, preserveFragment: true },
  { selector: 'area[href]', attribute: 'href', link: true },
  { selector: 'img[src]', attribute: 'src' },
  { selector: 'img[longdesc]', attribute: 'longdesc' },
  { selector: 'source[src]', attribute: 'src' },
  { selector: 'video[src]', attribute: 'src' },
  { selector: 'video[poster]', attribute: 'poster' },
  { selector: 'audio[src]', attribute: 'src' },
  { selector: 'track[src]', attribute: 'src' },
  { selector: 'blockquote[cite], q[cite], del[cite], ins[cite]', attribute: 'cite' }
];

// Defines the srcset attributes enforced by this service.
const SRCSET_ATTRIBUTES = [
  { selector: 'img[srcset]', attribute: 'srcset' },
  { selector: 'source[srcset]', attribute: 'srcset' }
];

// This function validates the article URL for use as a resolution base.
function validBaseUrl(baseUrl) {
  try {
    // Derives the parsed required while performing valid base url.
    const parsed = new URL(String(baseUrl || '').trim());
    // Selects the result based on whether value contains parsed protocol.
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

// This function resolves one embedded URL according to its attribute category.
function resolveUrl(value, baseUrl, { link = false, preserveFragment = false } = {}) {
  // Normalizes the trimmed before resolving url.
  const trimmed = String(value || '').trim();
  // Returns no result when trimmed is unavailable.
  if (!trimmed) return null;

  // Returns early when starts with succeeds.
  if (trimmed.startsWith('#')) {
    // Selects the result based on whether preserve fragment is available.
    return preserveFragment ? trimmed : null;
  }

  try {
    // Selects the resolved based on whether base url is available.
    const resolved = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    // Selects the allowed protocols based on whether link is available.
    const allowedProtocols = link
      ? ['http:', 'https:', 'mailto:', 'tel:']
      : ['http:', 'https:'];
    // Selects the result based on whether allowed protocols contains resolved protocol.
    return allowedProtocols.includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

// This function resolves embedded HTML URLs against the article URL.
function normalizeHtmlUrls($, baseUrl) {
  // Derives the base through valid base url while normalizing html url.
  const base = validBaseUrl(baseUrl);

  // Processes each url attributes entry in turn.
  for (const { selector, attribute, link, preserveFragment } of URL_ATTRIBUTES) {
    // Runs the callback required while normalizing html url.
    $(selector).each((_, el) => {
      // Derives the node through $ while normalizing html url.
      const node = $(el);
      // Resolves the url while normalizing html url.
      const resolved = resolveUrl(node.attr(attribute), base, { link, preserveFragment });

      // Handles the case where resolved is available.
      if (resolved) {
        node.attr(attribute, resolved);
      } else {
        node.removeAttr(attribute);
      }
    });
  }

  // Processes each srcset attributes entry in turn.
  for (const { selector, attribute } of SRCSET_ATTRIBUTES) {
    // Runs the callback required while normalizing html url.
    $(selector).each((_, el) => {
      // Derives the node through $ while normalizing html url.
      const node = $(el);
      // Normalizes the normalized before normalizing html url.
      const normalized = normalizeSrcset(node.attr(attribute), base);

      // Handles the case where normalized is available.
      if (normalized) {
        node.attr(attribute, normalized);
      } else {
        node.removeAttr(attribute);
      }
    });
  }
}

export default normalizeHtmlUrls;
