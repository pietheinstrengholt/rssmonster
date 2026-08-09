// Decodes bounded neutral response bytes using deterministic feed-aware charset precedence.

const SUPPORTED_CHARSETS = Object.freeze({
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  'utf-16le': 'utf-16le',
  utf16le: 'utf-16le',
  'utf-16be': 'utf-16be',
  utf16be: 'utf-16be',
  'iso-8859-1': 'iso-8859-1',
  iso88591: 'iso-8859-1',
  latin1: 'iso-8859-1',
  'windows-1252': 'windows-1252',
  windows1252: 'windows-1252',
  cp1252: 'windows-1252'
});

// Creates a stable decoding failure without exposing TextDecoder exceptions.
const createDecodingError = (code, message) => {
  const error = new Error(message);
  error.name = 'FeedBodyDecodingError';
  error.code = code;
  return error;
};

// Normalizes one supported charset label or rejects an explicit unsupported label.
const normalizeCharset = (value, inferredUtf16 = null) => {
  const label = String(value || '').trim().toLowerCase().replace(/[_\s]/g, '-');
  if (label === 'utf-16' || label === 'utf16') {
    if (inferredUtf16) return inferredUtf16;
    throw createDecodingError(
      'UNSUPPORTED_FEED_CHARSET',
      'UTF-16 feed encoding requires a byte-order marker or detectable byte order'
    );
  }
  const normalized = SUPPORTED_CHARSETS[label];
  if (!normalized) {
    throw createDecodingError(
      'UNSUPPORTED_FEED_CHARSET',
      `Unsupported feed charset: ${value}`
    );
  }
  return normalized;
};

// Detects a Unicode byte-order marker before consulting declarations.
const detectBom = bytes => {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { charset: 'utf-8', length: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { charset: 'utf-16le', length: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { charset: 'utf-16be', length: 2 };
  }
  return null;
};

// Infers UTF-16 byte order from the XML opening token when no BOM exists.
const inferUtf16ByteOrder = bytes => {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x3c && bytes[1] === 0x00 &&
    bytes[2] === 0x3f && bytes[3] === 0x00
  ) {
    return 'utf-16le';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 && bytes[1] === 0x3c &&
    bytes[2] === 0x00 && bytes[3] === 0x3f
  ) {
    return 'utf-16be';
  }
  return null;
};

// Extracts an explicit HTTP charset from a neutral Content-Type header.
export const extractHttpCharset = contentType => {
  const match = String(contentType || '').match(
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i
  );
  return match ? (match[1] || match[2] || match[3]).trim() : null;
};

// Decodes only a small XML declaration prefix using its detectable byte layout.
const xmlDeclarationPrefix = (bytes, inferredUtf16) => {
  const prefix = bytes.subarray(0, Math.min(bytes.length, 1024));
  if (inferredUtf16) {
    try {
      return new TextDecoder(inferredUtf16).decode(prefix);
    } catch {
      return '';
    }
  }
  let text = '';
  for (const byte of prefix) text += String.fromCharCode(byte);
  return text;
};

// Extracts a charset only from a syntactically plausible XML declaration.
export const extractXmlDeclarationCharset = (bytes, inferredUtf16 = null) => {
  const prefix = xmlDeclarationPrefix(bytes, inferredUtf16);
  const match = /<\?xml\s+[^?]*\?>/i.exec(prefix);
  if (!match) return null;
  if (/<(?:html|head|body|script|style)\b/i.test(prefix.slice(0, match.index))) {
    return null;
  }
  const declaration = match[0];
  const encoding = declaration.match(/\bencoding\s*=\s*(['"])([^'"]+)\1/i);
  return encoding?.[2]?.trim() || null;
};

// Decodes ISO-8859-1 without WHATWG's implicit Windows-1252 remapping.
const decodeIso88591 = bytes => {
  const parts = [];
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    parts.push(String.fromCharCode(...chunk));
  }
  return parts.join('');
};

// Decodes one supported charset without replacement characters on malformed Unicode input.
const decodeWithCharset = (bytes, charset) => {
  if (charset === 'iso-8859-1') return decodeIso88591(bytes);
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    throw createDecodingError(
      'INVALID_FEED_ENCODING',
      `Feed body contains invalid ${charset} byte sequences`
    );
  }
};

// Decodes bytes using BOM, HTTP, XML declaration, inferred UTF-16, then UTF-8 precedence.
export const decodeResponseBytes = (bytesInput, headers = {}) => {
  const bytes = bytesInput instanceof Uint8Array
    ? bytesInput
    : new Uint8Array(bytesInput || []);
  const bom = detectBom(bytes);
  const withoutBom = bom ? bytes.subarray(bom.length) : bytes;
  const inferredUtf16 = inferUtf16ByteOrder(withoutBom);
  const httpCharset = extractHttpCharset(headers['content-type']);
  const xmlCharset = extractXmlDeclarationCharset(withoutBom, inferredUtf16);

  let charset;
  let source;
  if (bom) {
    charset = bom.charset;
    source = 'bom';
  } else if (httpCharset) {
    charset = normalizeCharset(httpCharset, inferredUtf16);
    source = 'http';
  } else if (xmlCharset) {
    charset = normalizeCharset(xmlCharset, inferredUtf16);
    source = 'xml';
  } else if (inferredUtf16) {
    charset = inferredUtf16;
    source = 'byte_pattern';
  } else {
    charset = 'utf-8';
    source = 'default';
  }

  return {
    text: decodeWithCharset(withoutBom, charset),
    charset,
    charsetSource: source,
    bomLength: bom?.length || 0
  };
};

export default {
  decodeResponseBytes,
  extractHttpCharset,
  extractXmlDeclarationCharset
};
