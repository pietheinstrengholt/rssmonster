import { load } from 'cheerio';

// This function creates a concise title from the first sentence of supplied article content.
function generateTitleFromContent(content) {
  // Returns no result when content is not string.
  if (typeof content !== 'string') return null;

  // Performs the load operation while generating title from content.
  const $ = load(content);
  $('br').replaceWith(' ');
  $('p, div, li, h1, h2, h3, h4, h5, h6, section, article').append(' ');

  // Normalizes the text before generating title from content.
  const text = $.text()
    .replace(/\s+/g, ' ')
    .trim();

  // Returns no result when text is unavailable.
  if (!text) return null;

  // Derives the sentence match through match while generating title from content.
  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/u);
  return (sentenceMatch?.[0] || text).trim();
}

export default generateTitleFromContent;
