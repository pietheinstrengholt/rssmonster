import { isInferenceEnabled } from '../config/intelligentFeatures.js';
import { getAvailableInferenceCapabilities } from '../services/inference/status.js';
import { getAIPermissions } from '../services/ai/capabilities.js';

export const INFERENCE_DISABLED_RESPONSE = {
  error: 'Inference features are disabled',
  code: 'INFERENCE_DISABLED'
};

// Keeps disabled inference capabilities quiet and prevents their controllers from running.
export const requireInferenceEnabled = async (_req, res, next) => {
  if (isInferenceEnabled() && Object.values(await getAvailableInferenceCapabilities()).some(Boolean)) return next();
  return res.status(503).json(INFERENCE_DISABLED_RESPONSE);
};

// Require the independent server permission; inference owns provider availability.
export const requireAssistantEnabled = async (_req, res, next) => {
  if (getAIPermissions().assistant && (await getAvailableInferenceCapabilities()).assistant) return next();
  return res.status(503).json(INFERENCE_DISABLED_RESPONSE);
};

// Converts a fail-closed client error into the same quiet capability response.
export const handleInferenceDisabledError = (err, _req, res, next) => {
  if (err?.code !== 'INFERENCE_DISABLED') return next(err);
  return res.status(503).json(INFERENCE_DISABLED_RESPONSE);
};

export default {
  handleInferenceDisabledError,
  requireAssistantEnabled,
  requireInferenceEnabled
};
