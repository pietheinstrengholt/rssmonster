import db from '../models/index.js';
import { DEFAULT_SIDEBAR_SECTION_ORDER, loadSidebarSettings } from '../services/sidebarSettings.js';

export const getSettings = async (req, res) => {
  const userId = req.userData?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  try {
    return res.status(200).json({ settings: await loadSidebarSettings(userId) });
  } catch (error) {
    console.error('Error loading sidebar settings:', error);
    return res.status(500).json({ error: 'Unable to load sidebar settings' });
  }
};

export const updateSettings = async (req, res) => {
  const userId = req.userData?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  const settings = req.body?.settings;
  if (!settings || Array.isArray(settings)
    || typeof settings.sortByCurrentSelection !== 'boolean'
    || typeof settings.showFeedFavicons !== 'boolean'
    || typeof settings.showTotalCount !== 'boolean'
    || typeof settings.declutterCounts !== 'boolean'
    || typeof settings.hideZeroCountItems !== 'boolean'
    || typeof settings.automaticallyHideInactiveFeeds !== 'boolean') {
    return res.status(400).json({ error: 'Sidebar setting flags must be boolean values' });
  }
  if (![30, 60, 90].includes(settings.inactiveFeedDays)) {
    return res.status(400).json({ error: 'inactiveFeedDays must be 30, 60 or 90' });
  }
  if (!['manual', 'name', 'selectedCount', 'totalCount', 'recentlyActive'].includes(settings.sortOrder)) {
    return res.status(400).json({ error: 'Invalid sidebar sortOrder' });
  }
  if (settings.sectionOrder !== undefined && (!Array.isArray(settings.sectionOrder)
    || settings.sectionOrder.length !== DEFAULT_SIDEBAR_SECTION_ORDER.length
    || new Set(settings.sectionOrder).size !== DEFAULT_SIDEBAR_SECTION_ORDER.length
    || !settings.sectionOrder.every(id => DEFAULT_SIDEBAR_SECTION_ORDER.includes(id)))) {
    return res.status(400).json({ error: 'sectionOrder must contain each supported sidebar section exactly once' });
  }
  const values = {
    showFeedFavicons: settings.showFeedFavicons,
    showTotalCount: settings.showTotalCount,
    declutterCounts: settings.declutterCounts,
    hideZeroCountItems: settings.hideZeroCountItems,
    automaticallyHideInactiveFeeds: settings.automaticallyHideInactiveFeeds,
    inactiveFeedDays: settings.inactiveFeedDays,
    sortByCurrentSelection: settings.sortByCurrentSelection,
    sortOrder: settings.sortOrder
  };
  if (settings.sectionOrder !== undefined) values.sectionOrder = settings.sectionOrder;
  try {
    await db.SidebarSetting.upsert({ userId, ...values });
    return res.status(200).json({ settings: await loadSidebarSettings(userId) });
  } catch (error) {
    console.error('Error saving sidebar settings:', error);
    return res.status(500).json({ error: 'Unable to save sidebar settings' });
  }
};
