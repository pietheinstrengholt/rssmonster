const TAG_DISPLAY_NAMES = new Map([['openai', 'OpenAI']]);

// This function formats stored tag names for display.
export const formatTagName = (tag, { preserveCase = false } = {}) => {
  const name = String(tag || '');
  const normalized = name.toLowerCase();
  if (preserveCase && TAG_DISPLAY_NAMES.has(normalized)) return TAG_DISPLAY_NAMES.get(normalized);
  if (preserveCase && /[A-Z]/.test(name)) return name;

  if (!normalized) {
    return '';
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};
