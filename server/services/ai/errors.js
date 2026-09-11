// Keep categorical transport diagnostics shared without coupling domain callers to transport imports.
export {
  getSafeInferenceErrorDetails,
  getSafeInferenceErrorMessage
} from '../inference/inferenceClient.js';

export class AIValidationError extends Error {
  constructor(capability, response = false) {
    super(`${capability} ${response ? 'response' : 'request'} is malformed`);
    this.name = 'AIValidationError';
    this.code = response ? 'AI_INVALID_RESPONSE' : 'AI_INVALID_REQUEST';
    this.capability = capability;
  }
}

export const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
