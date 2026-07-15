import { load } from 'cheerio';

// This function creates a concise title from the first sentence of supplied article content.
function generateTitleFromContent(content) {
  if (typeof content !== 'string') return null;

  const $ = load(content);
  $('br').replaceWith(' ');
  $('p, div, li, h1, h2, h3, h4, h5, h6, section, article').append(' ');

  const text = $.text()
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/u);
  return (sentenceMatch?.[0] || text).trim();
}

export default generateTitleFromContent;
