import { archivingSettingsSchema, getArchivingSettings, saveArchivingSettings } from '../services/archivingSettings.js';

export async function get(req, res) {
  const userId = req.userData?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  try {
    return res.json(await getArchivingSettings(userId));
  } catch (error) {
    console.error('Error loading archiving settings:', error);
    return res.status(500).json({ error: 'Could not load archiving settings' });
  }
}

export async function put(req, res) {
  const userId = req.userData?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  const parsed = archivingSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid archiving settings', details: parsed.error.issues });
  try {
    return res.json(await saveArchivingSettings(userId, parsed.data));
  } catch (error) {
    console.error('Error saving archiving settings:', error);
    return res.status(500).json({ error: 'Could not save archiving settings' });
  }
}
