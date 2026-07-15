import { normalizeSrcset } from './srcset.js';

const URL_ATTRIBUTES = [
  { selector: 'a[href]', attribute: 'href', link: true, preserveFragment: true },
  { selector: 'area[href]', attribute: 'href', link: true },
  { selector: 'img[src]', attribute: 'src' },
  { selector: 'img[longdesc]', attribute: 'longdesc' },
  { selector: 'source[src]', attribute: 'src' },
  { selector: 'video[src]', attribute: 'src' },
  { selector: 'video[poster]', attribute: 'poster' },
  { selector: 'audio[src]', attribute: 'src' },
  { selector: 'blockquote[cite], q[cite], del[cite], ins[cite]', attribute: 'cite' }
];

const SRCSET_ATTRIBUTES = [
  { selector: 'img[srcset]', attribute: 'srcset' },
  { selector: 'source[srcset]', attribute: 'srcset' }
];

// This function validates the article URL once for use as a resolution base.
function validBaseUrl(baseUrl) {
  try {
    const parsed = new URL(String(baseUrl || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

// This function resolves one embedded URL according to its attribute category.
function resolveUrl(value, baseUrl, { link = false, preserveFragment = false } = {}) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    return preserveFragment ? trimmed : null;
  }

  try {
    const resolved = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    const allowedProtocols = link
      ? ['http:', 'https:', 'mailto:', 'tel:']
      : ['http:', 'https:'];
    return allowedProtocols.includes(resolved.protocol) ? resolved.href : null;
  } catch {
    return null;
  }
}

// This function resolves embedded HTML URLs against the article URL.
function normalizeHtmlUrls($, baseUrl) {
  const base = validBaseUrl(baseUrl);

  for (const { selector, attribute, link, preserveFragment } of URL_ATTRIBUTES) {
    $(selector).each((_, el) => {
      const node = $(el);
      const resolved = resolveUrl(node.attr(attribute), base, { link, preserveFragment });

      if (resolved) {
        node.attr(attribute, resolved);
      } else {
        node.removeAttr(attribute);
      }
    });
  }

  for (const { selector, attribute } of SRCSET_ATTRIBUTES) {
    $(selector).each((_, el) => {
      const node = $(el);
      const normalized = normalizeSrcset(node.attr(attribute), base);

      if (normalized) {
        node.attr(attribute, normalized);
      } else {
        node.removeAttr(attribute);
      }
    });
  }
}

export default normalizeHtmlUrls;
