import db from '../models/index.js';

// Return effective defaults without creating rows on reads.
export const loadSidebarSettings = async userId => {
  const stored = await db.SidebarSetting.findOne({ where: { userId } });
  const settings = stored || db.SidebarSetting.build({ userId });
  return {
    showTotalCount: Boolean(settings.showTotalCount),
    declutterCounts: Boolean(settings.declutterCounts)
  };
};
