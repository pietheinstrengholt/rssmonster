import { isAssistantEnabled, isInferenceEnabled } from '../config/intelligentFeatures.js';

export const INFERENCE_DISABLED_RESPONSE = {
  error: 'Inference features are disabled',
  code: 'INFERENCE_DISABLED'
};

// Keeps disabled inference capabilities quiet and prevents their controllers from running.
export const requireInferenceEnabled = (_req, res, next) => {
  if (isInferenceEnabled()) return next();
  return res.status(503).json(INFERENCE_DISABLED_RESPONSE);
};

// Keeps the assistant unavailable unless its independent provider is configured.
export const requireAssistantEnabled = (_req, res, next) => {
  if (isAssistantEnabled()) return next();
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
