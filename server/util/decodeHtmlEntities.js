// util/decodeHtmlEntities.js
import he from 'he';

export default function decodeHtmlEntities(value) {
  if (!value || typeof value !== 'string') return value;
  return he.decode(value);
}