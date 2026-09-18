export { requireAdministrator as requireInferenceAdministrator } from '../middleware/administrator.js';
import { getAIPermissions } from '../services/ai/capabilities.js';
import { getInferenceConfigurationMetadata, saveInferenceConfiguration,
  clearInferenceConfiguration, InferenceConfigurationError } from '../services/inference/configuration.js';
import { clearInferenceStatus, getInferenceStatus, testInferenceConfiguration } from '../services/inference/status.js';

const action = operation => async (req, res) => {
  try { res.json(await operation(req)); } catch (error) {
    res.status(error instanceof InferenceConfigurationError ? error.status : 503)
      .json({ error: error instanceof InferenceConfigurationError ? error.message : 'Inference settings could not be loaded' });
  }
};
const withPermissions = status => ({ ...status, permissions: getAIPermissions() });
export const getInferenceSettings = action(async () => ({
  ...await getInferenceConfigurationMetadata(),
  status: withPermissions(await getInferenceStatus().catch(() => ({ state: 'configuration_error', ready: false, capabilities: null })))
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
export const testInferenceSettings = action(async req => withPermissions(await (req.body && Object.keys(req.body).length
  ? testInferenceConfiguration(req.body) : getInferenceStatus({ refresh: true }))));
