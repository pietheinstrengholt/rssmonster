// This function makes every part of a Mastodon-formatted link visible.
export const transformMastodonContent = ($) => {
  $('a').each((_, el) => {
    const node = $(el);
    const children = node.children();
    const visibleParts = children.filter('span:not(.invisible)');
    const invisibleParts = children.filter('span.invisible');
    const hasUnexpectedText = node
      .contents()
      .toArray()
      .some(child => child.type === 'text' && $(child).text().trim());

    if (
      visibleParts.length !== 1 ||
      invisibleParts.length === 0 ||
      children.length !== visibleParts.length + invisibleParts.length ||
      hasUnexpectedText
    ) {
      return;
    }

    if (!visibleParts.text().replace(/\s+/g, ' ').trim()) return;

    invisibleParts.removeClass('invisible');

    children.each((_, span) => {
      const part = $(span);
      if (!String(part.attr('class') || '').trim()) part.removeAttr('class');
    });
  });
};
