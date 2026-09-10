import { getServiceHealth } from '../services/health/serviceHealth.js';

export const getServicesHealth = async (req, res) => {
  if (!req.userData?.userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    return res.status(200).json(await getServiceHealth());
  } catch {
    return res.status(500).json({ error: 'Unable to load service health' });
  }
};
