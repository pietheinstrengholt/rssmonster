// This function makes every part of a Mastodon-formatted link visible.
export const transformMastodonContent = ($) => {
  // Runs the callback required while performing transform mastodon content.
  $('a').each((_, el) => {
    // Derives the node through $ while performing transform mastodon content.
    const node = $(el);
    // Derives the children through children while performing transform mastodon content.
    const children = node.children();
    // Keeps the visible parts entries eligible while performing transform mastodon content.
    const visibleParts = children.filter('span:not(.invisible)');
    // Keeps the invisible parts entries eligible while performing transform mastodon content.
    const invisibleParts = children.filter('span.invisible');
    // Derives the has unexpected text through some while performing transform mastodon content.
    const hasUnexpectedText = node
      .contents()
      .toArray()
      .some(child => child.type === 'text' && $(child).text().trim());

    // Returns early when visible parts count is not 1 or invisible parts count is value or children count is not visible parts or has unexpected text is available.
    if (
      visibleParts.length !== 1 ||
      invisibleParts.length === 0 ||
      children.length !== visibleParts.length + invisibleParts.length ||
      hasUnexpectedText
    ) {
      return;
    }

    // Returns early when trim is unavailable.
    if (!visibleParts.text().replace(/\s+/g, ' ').trim()) return;

    invisibleParts.removeClass('invisible');

    // Runs the callback required while performing transform mastodon content.
    children.each((_, span) => {
      // Derives the part through $ while performing transform mastodon content.
      const part = $(span);
      // Handles the case where trim is unavailable.
      if (!String(part.attr('class') || '').trim()) part.removeAttr('class');
    });
  });
};
