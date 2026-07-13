import sanitizeHtml from 'sanitize-html';
import {
  ALLOWED_TAGS,
  GLOBAL_ATTRS,
  TAG_ATTRS,
  TAG_CLASSES,
  URL_ATTRS,
  isSafeUrl
} from './htmlContentAllowlists.js';

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
  const transformed = filterUnsafeUrlAttributes(tagName, classFilteredAttribs);
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
