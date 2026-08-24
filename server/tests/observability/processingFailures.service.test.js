import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    ProcessingFailure: { create: mocks.create }
  }
}));

import {
  classifyProcessingFailure,
  processingFailureFingerprint,
  recordProcessingFailure,
  wasProcessingFailureRecorded
} from '../../services/observability/processingFailures.js';

describe('processing failure observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockImplementation(async values => values);
  });

  it('classifies stable operational failure types', () => {
    expect(classifyProcessingFailure(Object.assign(new Error('request timed out'), {
      code: 'INFERENCE_TIMEOUT'
    }))).toBe('TIMEOUT');
    expect(classifyProcessingFailure(Object.assign(new Error('lease lost'), {
      code: 'FEED_LEASE_LOST'
    }))).toBe('LEASE_LOST');
    expect(classifyProcessingFailure({ name: 'SequelizeDatabaseError' }))
      .toBe('PERSISTENCE_FAILURE');
  });

  it('persists a bounded sanitized occurrence and marks its error as recorded', async () => {
    const error = Object.assign(new Error(
      'Provider failed at https://example.com/embed?token=secret'
    ), { code: 'INFERENCE_UNAVAILABLE' });

    await recordProcessingFailure({
      crawlRunId: 12,
      executionId: '63d10c01-b2c7-47c7-8cb0-cb920987457f',
      userId: 4,
      stage: 'embedding',
      error,
      subjectType: 'article',
      subjectId: 91,
      feedId: 8,
      articleId: 91,
      context: {
        provider: 'openai',
        apiToken: 'do-not-store',
        url: 'https://example.com/embed?api_key=secret'
      }
    });

    const values = mocks.create.mock.calls[0][0];
    expect(values).toMatchObject({
      crawlRunId: 12,
      userId: 4,
      stage: 'embedding',
      failureType: 'UNAVAILABLE',
      retryable: true,
      feedId: 8,
      articleId: 91
    });
    expect(values.message).toContain('token=REDACTED');
    expect(values.context.apiToken).toBe('REDACTED');
    expect(values.context.url).toContain('api_key=REDACTED');
    expect(values.fingerprint).toHaveLength(64);
    expect(wasProcessingFailureRecorded(error)).toBe(true);

    await recordProcessingFailure({ userId: 4, stage: 'embedding', error });
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('generates the same fingerprint for messages that differ only by identifiers', () => {
    const first = processingFailureFingerprint({
      stage: 'embedding',
      failureType: 'ERROR',
      code: 'FAILED',
      message: 'Article 123 failed'
    });
    const second = processingFailureFingerprint({
      stage: 'embedding',
      failureType: 'ERROR',
      code: 'FAILED',
      message: 'Article 456 failed'
    });
    expect(first).toBe(second);
  });

  it('does not replace the original failure when observability persistence fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.create.mockRejectedValue(new Error('database unavailable'));

    await expect(recordProcessingFailure({
      userId: 4,
      stage: 'crawl',
      error: new Error('original crawl error')
    })).resolves.toBeNull();

    expect(consoleError).toHaveBeenCalled();
  });
});
