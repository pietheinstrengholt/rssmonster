// Decodes HTML entities in text fields while passing through non-string values.
// This helper keeps feed text cleanup consistent wherever encoded titles or content appear.
import he from 'he';

// Returns a decoded string, or the original value when it cannot be decoded meaningfully.
export default function decodeHtmlEntities(value) {
  if (!value || typeof value !== 'string') return value;
  return he.decode(value);
}
