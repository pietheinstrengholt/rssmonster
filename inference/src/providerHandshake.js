import { APIConnectionTimeoutError } from 'openai';
import { getAssistantConfig, getCompatibleApiKey, getGenerationConfig } from './config/config.js';
import { getSafeErrorDetails, isInferenceDebugEnabled } from './debug.js';
import { createCompatibleClient } from './providers/openaiCompatible.js';

const checkProviderHandshake = async (capability, {
  environment = process.env,
  logger = console
} = {}) => {
  if (!isInferenceDebugEnabled(environment)) return;

  const label = capability === 'ASSISTANT' ? 'Assistant' : 'Generation';
  try {
    if (capability === 'ASSISTANT' && !getCompatibleApiKey(capability, environment) &&
      !environment.ASSISTANT_PROVIDER && !environment.ASSISTANT_BASE_URL && !environment.ASSISTANT_MODEL) return;
    const config = capability === 'ASSISTANT'
      ? getAssistantConfig(environment)
      : getGenerationConfig(environment);
    if (config.provider !== 'openai-compatible') return;

    logger.log(`[INFERENCE] ${label} handshake checking provider=openai-compatible`);
    const client = createCompatibleClient(capability, environment);
    const response = await client.models.list({ timeout: 5000, maxRetries: 0 });
    if (!Array.isArray(response.data)) {
      logger.warn(`[INFERENCE] ${label} handshake failed: invalid model-list response`);
      return;
    }
    if (!response.data.some(model => model?.id === config.modelId)) {
      logger.warn(
        `[INFERENCE] ${label} handshake failed: endpoint responded but configured model=${JSON.stringify(config.modelId)} was not listed`
      );
      return;
    }
    logger.log(
      `[INFERENCE] ${label} handshake succeeded: endpoint responding, model=${JSON.stringify(config.modelId)} available (generation not tested)`
    );
  } catch (error) {
    const details = getSafeErrorDetails(error);
    const cause = getSafeErrorDetails(error?.cause);
    if (cause.code) details.causeCode = cause.code;
    if (error instanceof APIConnectionTimeoutError) details.code = 'ETIMEDOUT';
    logger.warn(`[INFERENCE] ${label} handshake failed: check endpoint, credentials, and model availability`, details);
  }
};

export const checkGenerationHandshake = options => checkProviderHandshake('GENERATION', options);
export const checkAssistantHandshake = options => checkProviderHandshake('ASSISTANT', options);
