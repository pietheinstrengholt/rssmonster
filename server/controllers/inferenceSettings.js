import db from '../models/index.js';
import { getInferenceConfigurationMetadata, saveInferenceConfiguration,
  clearInferenceConfiguration, InferenceConfigurationError } from '../services/inference/configuration.js';
import { clearInferenceStatus, getInferenceStatus, testInferenceConfiguration } from '../services/inference/status.js';

export const requireInferenceAdministrator = async (req, res, next) => {
  const user = await db.User.findByPk(req.userData?.userId, { attributes: ['id', 'role'] });
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required' });
  next();
};
const action = operation => async (req, res) => {
  try { res.json(await operation(req)); } catch (error) {
    res.status(error instanceof InferenceConfigurationError ? error.status : 503)
      .json({ error: error instanceof InferenceConfigurationError ? error.message : 'Inference settings could not be loaded' });
  }
};
export const getInferenceSettings = action(async () => ({
  ...await getInferenceConfigurationMetadata(),
  status: await getInferenceStatus().catch(() => ({ state: 'configuration_error', ready: false, capabilities: null }))
}));
export const putInferenceSettings = action(async req => {
  const result = await saveInferenceConfiguration(req.body);
  clearInferenceStatus();
  return result;
});
export const deleteInferenceSettings = action(async () => {
  const result = await clearInferenceConfiguration();
  clearInferenceStatus();
  return result;
});
// An optional draft is tested without saving; an empty request tests the effective connection.
export const testInferenceSettings = action(async req => req.body && Object.keys(req.body).length
  ? testInferenceConfiguration(req.body) : getInferenceStatus({ refresh: true }));
