export const DEFAULT_SIDEBAR_SECTION_ORDER = Object.freeze([
  'pinned', 'smart-folders', 'all-feeds', 'top-tags', 'categories'
]);

export const normalizeSidebarSectionOrder = value => {
  const stored = Array.isArray(value) ? value : [];
  const recognized = stored.filter((id, index) =>
    DEFAULT_SIDEBAR_SECTION_ORDER.includes(id) && stored.indexOf(id) === index);
  // Older preferences kept Pinned fixed at the top. Preserve that placement until reordered.
  if (!recognized.includes('pinned')) recognized.unshift('pinned');
  return [...recognized, ...DEFAULT_SIDEBAR_SECTION_ORDER.filter(id => !recognized.includes(id))];
};
