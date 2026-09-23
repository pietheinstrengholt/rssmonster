import db from '../models/index.js';

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

// Return effective defaults without creating rows on reads.
export const loadSidebarSettings = async userId => {
  const stored = await db.SidebarSetting.findOne({ where: { userId } });
  const settings = stored || db.SidebarSetting.build({ userId });
  return {
    showFeedFavicons: Boolean(settings.showFeedFavicons),
    showTotalCount: Boolean(settings.showTotalCount),
    declutterCounts: Boolean(settings.declutterCounts),
    hideZeroCountItems: Boolean(settings.hideZeroCountItems),
    automaticallyHideInactiveFeeds: Boolean(settings.automaticallyHideInactiveFeeds),
    inactiveFeedDays: Number(settings.inactiveFeedDays),
    sortByCurrentSelection: Boolean(settings.sortByCurrentSelection),
    sortOrder: settings.sortOrder,
    sectionOrder: normalizeSidebarSectionOrder(settings.sectionOrder)
  };
};
