// Defines the min visible text length enforced by this service.
const MIN_VISIBLE_TEXT_LENGTH = 300;

// This function isolates Substack article content so email chrome stays outside the reader.
export const transformSubstackContent = ($) => {
  // Derives the article bodies through $ while performing transform substack content.
  const articleBodies = $('.body.markup');

  // Missing structural markers must be a strict no-op because this transformer is structure-only.
  if (articleBodies.length === 0) return;

  // Derives the visible text through join while performing transform substack content.
  const visibleText = articleBodies
    .toArray()
    .map(el => $(el).text().replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

  // The threshold avoids stripping articles if Substack changes or reuses this markup for small UI.
  if (visibleText.length < MIN_VISIBLE_TEXT_LENGTH) return;

  // Derives the article nodes through flat map while performing transform substack content.
  const articleNodes = articleBodies
    .toArray()
    .flatMap(el => $(el).contents().toArray());
  // Derives the document body through first while performing transform substack content.
  const documentBody = $('body').first();
  // Selects the container based on whether document body count exceeds value.
  const container = documentBody.length > 0 ? documentBody : $.root();

  container.empty().append(articleNodes);
};
