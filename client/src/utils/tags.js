// This function formats stored tag names for display.
export const formatTagName = tag => {
  const normalized = String(tag || '').toLowerCase();

  if (!normalized) {
    return '';
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
};
