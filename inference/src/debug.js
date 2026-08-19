export const isInferenceDebugEnabled = (environment = process.env) =>
  String(environment.INFERENCE_DEBUG || '').toLowerCase() === 'true';

export const logInferenceDebug = (message, {
  environment = process.env,
  logger = console
} = {}) => {
  if (isInferenceDebugEnabled(environment)) {
    logger.log(`[INFERENCE DEBUG] ${message}`);
  }
};

export default logInferenceDebug;
