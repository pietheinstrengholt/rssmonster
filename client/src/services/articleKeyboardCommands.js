export const ARTICLE_KEYBOARD_COMMAND = Object.freeze({
  NEXT: 'next',
  PREVIOUS: 'previous',
  OPEN: 'open',
  TOGGLE_READ: 'toggle-read',
  TOGGLE_FAVORITE: 'toggle-favorite'
});

const ARTICLE_COMMAND_BY_KEY = Object.freeze({
  ArrowDown: ARTICLE_KEYBOARD_COMMAND.NEXT,
  j: ARTICLE_KEYBOARD_COMMAND.NEXT,
  ArrowUp: ARTICLE_KEYBOARD_COMMAND.PREVIOUS,
  k: ARTICLE_KEYBOARD_COMMAND.PREVIOUS,
  Enter: ARTICLE_KEYBOARD_COMMAND.OPEN,
  o: ARTICLE_KEYBOARD_COMMAND.OPEN,
  m: ARTICLE_KEYBOARD_COMMAND.TOGGLE_READ,
  r: ARTICLE_KEYBOARD_COMMAND.TOGGLE_READ,
  s: ARTICLE_KEYBOARD_COMMAND.TOGGLE_FAVORITE
});

// Returns whether an event may be interpreted as an article keyboard shortcut.
export function isArticleKeyboardEventEligible(event, {
  allowShiftKey = false,
  allowInteractiveTarget = false,
  checkEditableAncestors = true
} = {}) {
  const target = event?.target;
  const tagName = target?.tagName?.toLowerCase();
  const isEditableTarget = ['input', 'textarea', 'select'].includes(tagName)
    || target?.isContentEditable
    || (checkEditableAncestors
      && Boolean(target?.closest?.('[contenteditable="true"], [contenteditable=""]')));
  const isInteractiveTarget = ['a', 'button'].includes(tagName);

  return !(
    event?.altKey
    || event?.ctrlKey
    || event?.metaKey
    || (!allowShiftKey && event?.shiftKey)
    || isEditableTarget
    || (!allowInteractiveTarget && isInteractiveTarget)
  );
}

// Interprets an eligible article shortcut without executing layout-specific behavior.
export function getArticleKeyboardCommand(event, eligibilityOptions) {
  if (!isArticleKeyboardEventEligible(event, eligibilityOptions)) return null;
  return ARTICLE_COMMAND_BY_KEY[event?.key] || null;
}
