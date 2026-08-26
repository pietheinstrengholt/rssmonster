import { describe, expect, it, vi } from 'vitest';
import {
  getSafeErrorDetails,
  getSafeStartupErrorDetails,
  isInferenceDebugEnabled,
  logInferenceDebug
} from '../src/debug.js';

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

describe('safe inference error details', () => {
  it('omits provider-controlled messages, URLs, credentials, and unknown metadata', () => {
    const error = new Error(
      'Private article title https://user:password@example.com/private?token=secret '
      + 'Authorization: Bearer private-token api_key=private-key'
    );
    error.name = 'ProviderError-private-title';
    error.code = 'private-token';
    error.response = { output: 'private model output', vectors: [[0.1, 0.2]] };

    const details = getSafeErrorDetails(error);

    expect(details).toEqual({ name: 'Error' });
    expect(JSON.stringify(details)).not.toMatch(
      /Private article|https:|password|token|api_key|model output|0\.1/
    );
  });

  it('keeps only allowlisted categorical diagnostics', () => {
    const error = new Error('must not be logged');
    error.name = 'InferenceQueueFullError';
    error.code = 'INFERENCE_QUEUE_FULL';
    error.status = 503;

    expect(getSafeErrorDetails(error)).toEqual({
      name: 'InferenceQueueFullError',
      code: 'INFERENCE_QUEUE_FULL',
      status: 503
    });
  });

  it('keeps redacted startup diagnostics without exposing credentials or URLs', () => {
    const error = new Error(
      'Failed to load model from https://user:password@example.com/model?token=url-secret\n' +
      'Authorization: Bearer bearer-secret api_key=key-secret at /models/cache/model.onnx'
    );
    error.code = 'EACCES';
    error.cause = Object.assign(new Error('private cause'), { code: 'ENOSPC' });

    const details = getSafeStartupErrorDetails(error);

    expect(details).toEqual({
      name: 'Error',
      code: 'EACCES',
      causeCode: 'ENOSPC',
      message: 'Failed to load model from <redacted-url> ' +
        'Authorization=REDACTED api_key=REDACTED at /models/cache/model.onnx'
    });
    expect(JSON.stringify(details)).not.toMatch(
      /user:password|example\.com|url-secret|bearer-secret|key-secret|private cause/
    );
  });

  it('keeps request-time errors categorical even when startup details are available', () => {
    const error = Object.assign(new Error('Failed to read /models/cache/model.onnx'), {
      code: 'EACCES'
    });

    expect(getSafeErrorDetails(error)).toEqual({ name: 'Error' });
    expect(getSafeStartupErrorDetails(error)).toEqual({
      name: 'Error',
      code: 'EACCES',
      message: 'Failed to read /models/cache/model.onnx'
    });
  });
});
