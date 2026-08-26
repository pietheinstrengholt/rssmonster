import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createRequestLifecycleMiddleware,
  getInferenceRequestId,
  isValidRequestId
} from '../src/middleware/requestLifecycle.js';

const createExchange = ({ requestId = 'request-123', statusCode = 200 } = {}) => {
  const req = Object.assign(new EventEmitter(), {
    method: 'POST',
    path: '/api/classifications/article',
    get: vi.fn(() => requestId)
  });
  const res = Object.assign(new EventEmitter(), {
    locals: {},
    statusCode,
    writableFinished: false,
    setHeader: vi.fn()
  });
  return { req, res };
};

describe('inference request lifecycle', () => {
  it('accepts only bounded content-safe request IDs', () => {
    expect(isValidRequestId('crawl_123:article-4')).toBe(true);
    expect(isValidRequestId('contains spaces')).toBe(false);
    expect(isValidRequestId('line\nbreak')).toBe(false);
    expect(isValidRequestId('x'.repeat(129))).toBe(false);
  });

  it('preserves the request ID and exposes it through request context', () => {
    const logger = { log: vi.fn() };
    const { req, res } = createExchange();
    let downstreamRequestId;

    createRequestLifecycleMiddleware({
      environment: { INFERENCE_DEBUG: 'true' },
      logger
    })(req, res, () => {
      downstreamRequestId = getInferenceRequestId();
    });

    expect(req.inferenceRequestId).toBe('request-123');
    expect(res.locals.inferenceRequestId).toBe('request-123');
    expect(downstreamRequestId).toBe('request-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'request-123');
  });

  it('replaces an unsafe incoming request ID', () => {
    const { req, res } = createExchange({ requestId: 'unsafe\nrequest' });

    createRequestLifecycleMiddleware()(req, res, vi.fn());

    expect(req.inferenceRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.inferenceRequestId).not.toContain('\n');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.inferenceRequestId);
  });

  it.each([
    { statusCode: 204, expectedEvent: 'request_completed' },
    { statusCode: 500, expectedEvent: 'request_failed' }
  ])('logs one $expectedEvent terminal event', ({ statusCode, expectedEvent }) => {
    const logger = { log: vi.fn() };
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(125);
    const { req, res } = createExchange({ statusCode });

    createRequestLifecycleMiddleware({
      environment: { INFERENCE_DEBUG: 'true' },
      logger,
      now
    })(req, res, vi.fn());
    res.writableFinished = true;
    res.emit('finish');
    res.emit('close');
    req.emit('aborted');

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log.mock.calls[0][0]).toContain('request_received');
    expect(logger.log.mock.calls[1][0]).toBe(
      `[INFERENCE DEBUG] ${expectedEvent} requestId="request-123" ` +
      `method="POST" path="/api/classifications/article" status=${statusCode} durationMs=25`
    );
  });

  it('logs an aborted close once without reporting completion', () => {
    const logger = { log: vi.fn() };
    const now = vi.fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(30);
    const { req, res } = createExchange();

    createRequestLifecycleMiddleware({
      environment: { INFERENCE_DEBUG: 'true' },
      logger,
      now
    })(req, res, vi.fn());
    res.emit('close');
    req.emit('aborted');
    res.emit('finish');

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log.mock.calls[1][0]).toBe(
      '[INFERENCE DEBUG] request_aborted requestId="request-123" ' +
      'method="POST" path="/api/classifications/article" durationMs=20'
    );
  });
});
