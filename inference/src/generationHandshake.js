import { APIConnectionTimeoutError } from 'openai';
import { getGenerationConfig } from './config/config.js';
import { getSafeErrorDetails, isInferenceDebugEnabled } from './debug.js';
import { createCompatibleClient } from './providers/openaiCompatible.js';

export const checkGenerationHandshake = async ({
  environment = process.env,
  logger = console
} = {}) => {
  if (!isInferenceDebugEnabled(environment)) return;

  try {
    const config = getGenerationConfig(environment);
    if (config.provider !== 'openai-compatible') return;

    logger.log('[INFERENCE] Generation handshake checking provider=openai-compatible');
    const client = createCompatibleClient('GENERATION', environment);
    const response = await client.models.list({ timeout: 5000, maxRetries: 0 });
    if (!Array.isArray(response.data)) {
      logger.warn('[INFERENCE] Generation handshake failed: invalid model-list response');
      return;
    }
    if (!response.data.some(model => model?.id === config.modelId)) {
      logger.warn(
        `[INFERENCE] Generation handshake failed: endpoint responded but configured model=${JSON.stringify(config.modelId)} was not listed`
      );
      return;
    }
    logger.log(
      `[INFERENCE] Generation handshake succeeded: endpoint responding, model=${JSON.stringify(config.modelId)} available (generation not tested)`
    );
  } catch (error) {
    const details = getSafeErrorDetails(error);
    const cause = getSafeErrorDetails(error?.cause);
    if (cause.code) details.causeCode = cause.code;
    if (error instanceof APIConnectionTimeoutError) details.code = 'ETIMEDOUT';
    logger.warn('[INFERENCE] Generation handshake failed: check endpoint, credentials, and model availability', details);
  }
};
