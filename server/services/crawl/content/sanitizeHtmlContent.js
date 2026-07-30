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

// Defines the vimeo embed attrs enforced by this service.
const VIMEO_EMBED_ATTRS = [
  'data-embed-provider',
  'data-embed-id',
  'data-embed-url',
  'data-embed-player-url',
  'data-embed-aspect-ratio'
];
// Defines the vimeo id pattern enforced by this service.
const VIMEO_ID_PATTERN = /^\d+$/;
// Defines the vimeo aspect ratio pattern enforced by this service.
const VIMEO_ASPECT_RATIO_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

// This function converts the content allowlists into sanitize-html attributes.
function allowedAttributesFromAllowlists() {
  // Maps source values into the result produced while performing allowed attributes from allowlists.
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
  // Returns early when attribs class is unavailable.
  if (!attribs.class) return attribs;

  // Derives the allowed classes required while performing filter class attribute.
  const allowedClasses = TAG_CLASSES[tagName] || new Set();
  // Keeps the class names entries eligible while performing filter class attribute.
  const classNames = String(attribs.class)
    .split(/\s+/)
    .filter(className => allowedClasses.has(className));
  // Builds the safe attribs assembled while performing filter class attribute.
  const safeAttribs = { ...attribs };

  // Handles the case where class names count exceeds value.
  if (classNames.length > 0) {
    safeAttribs.class = classNames.join(' ');
  } else {
    delete safeAttribs.class;
  }

  return safeAttribs;
}

// This function preserves internal Vimeo metadata only when the complete card identity is valid.
function filterInternalEmbedAttributes(tagName, attribs) {
  // Builds the safe attribs assembled while performing filter internal embed attributes.
  const safeAttribs = { ...attribs };
  // Tracks distinct class names while performing filter internal embed attributes.
  const classNames = new Set(String(attribs.class || '').split(/\s+/));
  // Coerces the provider id into the representation required while performing filter internal embed attributes.
  const providerId = String(attribs['data-embed-id'] || '');
  // Coerces the aspect ratio into the representation required while performing filter internal embed attributes.
  const aspectRatio = String(attribs['data-embed-aspect-ratio'] || '');
  // Derives the is canonical vimeo card required while performing filter internal embed attributes.
  const isCanonicalVimeoCard = tagName === 'figure' &&
    classNames.has('rss-content-card') &&
    classNames.has('rss-content-card--embed') &&
    classNames.has('rss-content-card--vimeo') &&
    attribs['data-embed-provider'] === 'vimeo' &&
    VIMEO_ID_PATTERN.test(providerId) &&
    attribs['data-embed-url'] === `https://vimeo.com/${providerId}` &&
    attribs['data-embed-player-url'] === `https://player.vimeo.com/video/${providerId}`;

  // Handles the case where is canonical vimeo card is unavailable.
  if (!isCanonicalVimeoCard) {
    // Processes each vimeo embed attrs entry in turn.
    for (const attrName of VIMEO_EMBED_ATTRS) delete safeAttribs[attrName];
    return safeAttribs;
  }

  // Handles the case where aspect ratio is available.
  if (aspectRatio) {
    // Coerces the numeric ratio into the representation required while performing filter internal embed attributes.
    const numericRatio = Number(aspectRatio);
    // Handles the case where aspect ratio does not match the expected format or numeric ratio is below 0.1 or numeric ratio exceeds 10.
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
  // Runs the callback required while performing allowed empty attributes from allowlists.
  return Array.from(new Set([
    ...GLOBAL_ATTRS,
    ...Object.values(TAG_ATTRS).flatMap(attrs => Array.from(attrs))
  ])).filter(attrName => !URL_ATTRS.has(attrName));
}

// This function removes URL attributes that do not match the existing URL rules.
function filterUnsafeUrlAttributes(tagName, attribs) {
  // Builds the safe attribs assembled while performing filter unsafe url attributes.
  const safeAttribs = { ...attribs };

  // Processes each entries entry in turn.
  for (const [name, value] of Object.entries(attribs || {})) {
    // Normalizes the attr name before performing filter unsafe url attributes.
    const attrName = name.toLowerCase();

    // Handles the case where url attrs contains attr name and value is not safe url.
    if (URL_ATTRS.has(attrName) && !isSafeUrl(value, attrName)) {
      delete safeAttribs[name];
    }
  }

  // Handles the case where safe attribs srcset is available.
  if (safeAttribs.srcset) {
    // Derives the normalized srcset through serialize srcset while performing filter unsafe url attributes.
    const normalizedSrcset = serializeSrcset(
      parseSrcset(safeAttribs.srcset)
        .filter(candidate => !candidate.url.startsWith('//'))
    );

    // Handles the case where normalized srcset is available.
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
  // Returns early when tag name is not a or attribs target is not  blank.
  if (tagName !== 'a' || attribs.target !== '_blank') {
    return {
      tagName,
      attribs
    };
  }

  // Tracks distinct rel tokens while performing harden blank target links.
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
  // Derives the class filtered attribs through filter class attribute while performing transform tag.
  const classFilteredAttribs = filterClassAttribute(tagName, attribs);
  // Derives the embed filtered attribs through filter internal embed attributes while performing transform tag.
  const embedFilteredAttribs = filterInternalEmbedAttributes(tagName, classFilteredAttribs);
  // Derives the transformed through filter unsafe url attributes while performing transform tag.
  const transformed = filterUnsafeUrlAttributes(tagName, embedFilteredAttribs);
  return hardenBlankTargetLinks(transformed.tagName, transformed.attribs);
}

// Builds the sanitize options assembled for this service.
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
