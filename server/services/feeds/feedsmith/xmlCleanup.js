// Applies narrowly scoped XML cleanup without mutating JSON Feed or CDATA content.

import he from 'he';

const XML_ROOT_PATTERN = /<\?xml\b|<!doctype\b|<(?:rss|feed|rdf:RDF)\b/i;
const HTML_STRUCTURE_PATTERN = /<!doctype\s+html\b|<(?:html|head|body|script|style)\b/i;
const XML_PREDEFINED_ENTITIES = new Set(['amp', 'lt', 'gt', 'apos', 'quot']);

// Creates the stable parser security error used for entity declarations.
const unsafeXmlError = () => {
  const error = new Error('DTD entity declarations are not allowed in feeds');
  error.name = 'UnsafeFeedXmlError';
  error.code = 'UNSAFE_FEED_XML';
  return error;
};

// Detects JSON before any XML cleanup and recognizes only plausible feed XML roots.
export const detectFeedSourceKind = source => {
  const text = String(source || '');
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const trimmed = withoutBom.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';

  const rootMatch = XML_ROOT_PATTERN.exec(withoutBom);
  if (!rootMatch) return 'unknown';
  const prefix = withoutBom.slice(0, rootMatch.index);
  if (HTML_STRUCTURE_PATTERN.test(prefix)) return 'unknown';
  return 'xml';
};

// Removes harmless warning text while refusing to skip structural HTML containers.
const removeLeadingXmlGarbage = source => {
  const rootMatch = XML_ROOT_PATTERN.exec(source);
  if (!rootMatch) return source;
  const prefix = source.slice(0, rootMatch.index);
  return HTML_STRUCTURE_PATTERN.test(prefix)
    ? source
    : source.slice(rootMatch.index);
};

// Finds the end of one DOCTYPE while respecting quoted IDs and internal subsets.
const findDoctypeEnd = (source, start) => {
  let quote = null;
  let subsetDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[') subsetDepth += 1;
    else if (char === ']' && subsetDepth > 0) subsetDepth -= 1;
    else if (char === '>' && subsetDepth === 0) return index + 1;
  }
  return -1;
};

// Removes complete DOCTYPE declarations without evaluating their internal subset.
export const removeDoctypeDeclarations = source => {
  let result = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<![CDATA[', index)) {
      const end = source.indexOf(']]>', index + 9);
      const next = end < 0 ? source.length : end + 3;
      result += source.slice(index, next);
      index = next;
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      const next = end < 0 ? source.length : end + 3;
      result += source.slice(index, next);
      index = next;
      continue;
    }
    if (source.slice(index, index + 9).toLowerCase() === '<!doctype') {
      const end = findDoctypeEnd(source, index + 9);
      if (end < 0) return source;
      if (/<!\s*ENTITY\b/i.test(source.slice(index, end))) {
        throw unsafeXmlError();
      }
      index = end;
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
};

// Reports whether a dangerous declaration remains outside comments and CDATA.
export const containsUnsafeXmlDeclaration = source => {
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('<![CDATA[', index)) {
      const end = source.indexOf(']]>', index + 9);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      index = end < 0 ? source.length : end + 3;
      continue;
    }
    const declaration = source.slice(index).match(/^<!\s*(?:DOCTYPE|ENTITY)\b/i);
    if (declaration) return true;
    index += 1;
  }
  return false;
};

// Checks XML character ranges while excluding literal restricted XML 1.1 controls.
const isLegalXmlCharacter = (codePoint, version) => {
  if (version === '1.1') {
    const legal = (
      codePoint >= 0x1 && codePoint <= 0xd7ff ||
      codePoint >= 0xe000 && codePoint <= 0xfffd ||
      codePoint >= 0x10000 && codePoint <= 0x10ffff
    );
    const restricted = (
      codePoint >= 0x1 && codePoint <= 0x8 ||
      codePoint === 0xb ||
      codePoint === 0xc ||
      codePoint >= 0xe && codePoint <= 0x1f ||
      codePoint >= 0x7f && codePoint <= 0x84 ||
      codePoint >= 0x86 && codePoint <= 0x9f
    );
    return legal && !restricted;
  }
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd ||
    codePoint >= 0x20 && codePoint <= 0xd7ff ||
    codePoint >= 0xe000 && codePoint <= 0xfffd ||
    codePoint >= 0x10000 && codePoint <= 0x10ffff;
};

// Removes only characters forbidden as literal XML text for the declared version.
export const removeIllegalXmlCharacters = source => {
  const version = source.match(/<\?xml\s+[^?]*\bversion\s*=\s*(['"])(1\.[01])\1/i)?.[2] || '1.0';
  let result = '';
  for (const char of source) {
    const codePoint = char.codePointAt(0);
    if (isLegalXmlCharacter(codePoint, version)) result += char;
  }
  return result;
};

// Converts one known HTML entity into XML-safe numeric character references.
const replaceNamedEntity = entity => {
  const name = entity.slice(1, -1);
  if (XML_PREDEFINED_ENTITIES.has(name)) return entity;
  let decoded;
  try {
    decoded = he.decode(entity, { strict: true });
  } catch {
    return entity;
  }
  if (!decoded || decoded === entity || decoded.includes('\uFFFD')) return entity;
  return [...decoded]
    .map(char => `&#${char.codePointAt(0)};`)
    .join('');
};

// Replaces HTML named entities only outside comments, CDATA, and processing instructions.
export const replaceHtmlNamedEntities = source => {
  let result = '';
  let index = 0;
  while (index < source.length) {
    const protectedToken = source.startsWith('<![CDATA[', index)
      ? ']]>'
      : source.startsWith('<!--', index)
        ? '-->'
        : source.startsWith('<?', index)
          ? '?>'
          : null;
    if (protectedToken) {
      const end = source.indexOf(protectedToken, index + 2);
      const next = end < 0 ? source.length : end + protectedToken.length;
      result += source.slice(index, next);
      index = next;
      continue;
    }
    const entity = source.slice(index).match(/^&[A-Za-z][A-Za-z0-9]+;/)?.[0];
    if (entity) {
      result += replaceNamedEntity(entity);
      index += entity.length;
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
};

// Cleans only plausible XML feeds and preserves decoded JSON source text unchanged.
export const prepareFeedSource = source => {
  const text = String(source || '');
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (detectFeedSourceKind(withoutBom) !== 'xml') return withoutBom;
  const rooted = removeLeadingXmlGarbage(withoutBom);
  const withoutDoctype = removeDoctypeDeclarations(rooted);
  const legalXml = removeIllegalXmlCharacters(withoutDoctype);
  return replaceHtmlNamedEntities(legalXml);
};

export default {
  containsUnsafeXmlDeclaration,
  detectFeedSourceKind,
  prepareFeedSource,
  removeDoctypeDeclarations,
  removeIllegalXmlCharacters,
  replaceHtmlNamedEntities
};
