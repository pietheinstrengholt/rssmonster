import { describe, expect, it, vi } from 'vitest';
import { isInferenceDebugEnabled, logInferenceDebug } from '../src/debug.js';

describe('inference debug logging', () => {
  it('is enabled only when INFERENCE_DEBUG is true', () => {
    expect(isInferenceDebugEnabled({ INFERENCE_DEBUG: 'true' })).toBe(true);
    expect(isInferenceDebugEnabled({ INFERENCE_DEBUG: 'TRUE' })).toBe(true);
    expect(isInferenceDebugEnabled({ INFERENCE_DEBUG: 'false' })).toBe(false);
    expect(isInferenceDebugEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('logs with the inference debug prefix when enabled', () => {
    const logger = { log: vi.fn() };

    logInferenceDebug('calling tag-generation provider=qwen', {
      environment: { INFERENCE_DEBUG: 'true' },
      logger
    });

    expect(logger.log).toHaveBeenCalledWith(
      '[INFERENCE DEBUG] calling tag-generation provider=qwen'
    );
  });

  it('does not log when disabled', () => {
    const logger = { log: vi.fn() };

    logInferenceDebug('hidden', {
      environment: { INFERENCE_DEBUG: 'false' },
      logger
    });

    expect(logger.log).not.toHaveBeenCalled();
  });
});
