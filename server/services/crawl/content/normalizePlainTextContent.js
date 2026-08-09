import { load } from 'cheerio';
import decodeHtmlEntities from '../../../utils/decodeHtmlEntities.js';

// This function encodes normalized plain-text paragraphs as display-safe HTML.
const renderPlainTextHtml = paragraphs => paragraphs.map(paragraph => {
  const $ = load('<p></p>', null, false);
  $('p').text(paragraph);
  return $.html();
}).join('\n');

// This function preserves literal plain text while deriving safe HTML and visible text.
export default function normalizePlainTextContent(value = '', { decodeEntities = false } = {}) {
  const source = decodeEntities ? decodeHtmlEntities(value) : String(value);
  const paragraphs = source
    .replace(/\r\n?/g, '\n')
    .split(/\n[\t ]*\n+/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return {
    html: renderPlainTextHtml(paragraphs),
    text: paragraphs.join('\n\n')
  };
}
