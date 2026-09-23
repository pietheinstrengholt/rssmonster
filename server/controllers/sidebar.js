import db from '../models/index.js';
import { loadSidebarSettings } from '../services/sidebarSettings.js';

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
    || typeof settings.showTotalCount !== 'boolean'
    || typeof settings.declutterCounts !== 'boolean') {
    return res.status(400).json({ error: 'showTotalCount and declutterCounts must be boolean values' });
  }
  const values = {
    showTotalCount: settings.showTotalCount,
    declutterCounts: settings.declutterCounts
  };
  try {
    await db.SidebarSetting.upsert({ userId, ...values });
    return res.status(200).json({ settings: values });
  } catch (error) {
    console.error('Error saving sidebar settings:', error);
    return res.status(500).json({ error: 'Unable to save sidebar settings' });
  }
};
