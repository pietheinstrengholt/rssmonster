import { getServerSettings, saveServerSettings } from '../services/serverSettings.js';

export const get = async (_req, res) => {
  try {
    res.json(await getServerSettings());
  } catch {
    res.status(503).json({ error: 'Server settings could not be loaded' });
  }
};

export const put = async (req, res) => {
  const input = req.body;
  if (!input || Object.keys(input).length !== 1 ||
      !Object.hasOwn(input, 'allowRegistration') ||
      (input.allowRegistration !== null && typeof input.allowRegistration !== 'boolean')) {
    return res.status(400).json({ error: 'allowRegistration must be true, false, or null to use the environment default' });
  }
  try {
    res.json(await saveServerSettings(input));
  } catch {
    res.status(503).json({ error: 'Server settings could not be saved' });
  }
};
