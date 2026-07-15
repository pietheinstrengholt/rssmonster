import sanitizeHtml from 'sanitize-html';
import {
  ALLOWED_TAGS,
  GLOBAL_ATTRS,
  TAG_ATTRS,
  TAG_CLASSES,
  URL_ATTRS,
  isSafeUrl
} from './htmlContentAllowlists.js';
import { parseSrcset, serializeSrcset } from './srcset.js';

const VIMEO_EMBED_ATTRS = [
  'data-embed-provider',
  'data-embed-id',
  'data-embed-url',
  'data-embed-player-url',
  'data-embed-aspect-ratio'
];
const VIMEO_ID_PATTERN = /^\d+$/;
const VIMEO_ASPECT_RATIO_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

// This function converts the existing allowlists into sanitize-html attributes.
function allowedAttributesFromAllowlists() {
  return {
    '*': Array.from(GLOBAL_ATTRS),
    ...Object.fromEntries(
      Object.entries(TAG_ATTRS).map(([tagName, attrs]) => [
        tagName,
        Array.from(attrs)
      ])
    )
  };
}

// This function keeps only explicitly supported classes on their canonical elements.
function filterClassAttribute(tagName, attribs) {
  if (!attribs.class) return attribs;

  const allowedClasses = TAG_CLASSES[tagName] || new Set();
  const classNames = String(attribs.class)
    .split(/\s+/)
    .filter(className => allowedClasses.has(className));
  const safeAttribs = { ...attribs };

  if (classNames.length > 0) {
    safeAttribs.class = classNames.join(' ');
  } else {
    delete safeAttribs.class;
  }

  return safeAttribs;
}

// This function preserves internal Vimeo metadata only when the complete card identity is valid.
function filterInternalEmbedAttributes(tagName, attribs) {
  const safeAttribs = { ...attribs };
  const classNames = new Set(String(attribs.class || '').split(/\s+/));
  const providerId = String(attribs['data-embed-id'] || '');
  const aspectRatio = String(attribs['data-embed-aspect-ratio'] || '');
  const isCanonicalVimeoCard = tagName === 'figure' &&
    classNames.has('rss-content-card') &&
    classNames.has('rss-content-card--embed') &&
    classNames.has('rss-content-card--vimeo') &&
    attribs['data-embed-provider'] === 'vimeo' &&
    VIMEO_ID_PATTERN.test(providerId) &&
    attribs['data-embed-url'] === `https://vimeo.com/${providerId}` &&
    attribs['data-embed-player-url'] === `https://player.vimeo.com/video/${providerId}`;

  if (!isCanonicalVimeoCard) {
    for (const attrName of VIMEO_EMBED_ATTRS) delete safeAttribs[attrName];
    return safeAttribs;
  }

  if (aspectRatio) {
    const numericRatio = Number(aspectRatio);
    if (
      !VIMEO_ASPECT_RATIO_PATTERN.test(aspectRatio) ||
      numericRatio < 0.1 ||
      numericRatio > 10
    ) {
      delete safeAttribs['data-embed-aspect-ratio'];
    }
  }

  return safeAttribs;
}

// This function keeps the old behavior for allowed empty non-URL attributes.
function allowedEmptyAttributesFromAllowlists() {
  return Array.from(new Set([
    ...GLOBAL_ATTRS,
    ...Object.values(TAG_ATTRS).flatMap(attrs => Array.from(attrs))
  ])).filter(attrName => !URL_ATTRS.has(attrName));
}

// This function removes URL attributes that do not match the existing URL rules.
function filterUnsafeUrlAttributes(tagName, attribs) {
  const safeAttribs = { ...attribs };

  for (const [name, value] of Object.entries(attribs || {})) {
    const attrName = name.toLowerCase();

    if (URL_ATTRS.has(attrName) && !isSafeUrl(value, attrName)) {
      delete safeAttribs[name];
    }
  }

  if (safeAttribs.srcset) {
    const normalizedSrcset = serializeSrcset(
      parseSrcset(safeAttribs.srcset)
        .filter(candidate => !candidate.url.startsWith('//'))
    );

    if (normalizedSrcset) {
      safeAttribs.srcset = normalizedSrcset;
    } else {
      delete safeAttribs.srcset;
    }
  }

  return {
    tagName,
    attribs: safeAttribs
  };
}

// This function hardens links that open in a new tab.
function hardenBlankTargetLinks(tagName, attribs) {
  if (tagName !== 'a' || attribs.target !== '_blank') {
    return {
      tagName,
      attribs
    };
  }

  const relTokens = new Set(
    String(attribs.rel || '')
      .split(/\s+/)
      .filter(Boolean)
  );

  relTokens.add('noopener');
  relTokens.add('noreferrer');

  return {
    tagName,
    attribs: {
      ...attribs,
      rel: Array.from(relTokens).join(' ')
    }
  };
}

// This function applies custom security transforms beyond sanitize-html defaults.
function transformTag(tagName, attribs) {
  const classFilteredAttribs = filterClassAttribute(tagName, attribs);
  const embedFilteredAttribs = filterInternalEmbedAttributes(tagName, classFilteredAttribs);
  const transformed = filterUnsafeUrlAttributes(tagName, embedFilteredAttribs);
  return hardenBlankTargetLinks(transformed.tagName, transformed.attribs);
}

const sanitizeOptions = {
  allowedTags: Array.from(ALLOWED_TAGS),
  allowedAttributes: allowedAttributesFromAllowlists(),
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https'],
    source: ['http', 'https']
  },
  allowedSchemesAppliedToAttributes: Array.from(URL_ATTRS),
  allowedEmptyAttributes: allowedEmptyAttributesFromAllowlists(),
  allowProtocolRelative: false,
  transformTags: {
    '*': transformTag
  }
};

// This function applies security sanitization to cleaned feed HTML.
function sanitizeHtmlContent(html) {
  return sanitizeHtml(html, sanitizeOptions);
}

export { sanitizeOptions };
export default sanitizeHtmlContent;
