import htmlToVisibleText from '../content/htmlToVisibleText.js';

// This function creates a concise title from the first sentence of supplied article content.
function generateTitleFromContent(content) {
  // Returns no result when content is not string.
  if (typeof content !== 'string') return null;

  // Normalizes canonical visible text into one line before generating a title.
  const text = htmlToVisibleText(content)
    .replace(/\s+/g, ' ')
    .trim();

  // Returns no result when text is unavailable.
  if (!text) return null;

  // Derives the sentence match through match while generating title from content.
  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/u);
  return (sentenceMatch?.[0] || text).trim();
}

export default generateTitleFromContent;
