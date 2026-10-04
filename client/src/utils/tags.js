const TAG_DISPLAY_NAMES = new Map([['openai', 'OpenAI']]);

// Matches the normalization used for persisted article tag names on the server.
export const normalizeTagName = tag => String(tag || '').trim().toLowerCase();

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
