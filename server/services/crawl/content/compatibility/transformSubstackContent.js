const MIN_VISIBLE_TEXT_LENGTH = 300;

// This function isolates Substack article content so email chrome stays outside the reader.
export const transformSubstackContent = ($) => {
  const articleBodies = $('.body.markup');

  // Missing structural markers must be a strict no-op because this transformer is structure-only.
  if (articleBodies.length === 0) return;

  const visibleText = articleBodies
    .toArray()
    .map(el => $(el).text().replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

  // The threshold avoids stripping articles if Substack changes or reuses this markup for small UI.
  if (visibleText.length < MIN_VISIBLE_TEXT_LENGTH) return;

  const articleNodes = articleBodies
    .toArray()
    .flatMap(el => $(el).contents().toArray());
  const documentBody = $('body').first();
  const container = documentBody.length > 0 ? documentBody : $.root();

  container.empty().append(articleNodes);
};
