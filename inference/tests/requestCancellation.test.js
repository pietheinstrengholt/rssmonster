import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  canWriteInferenceResponse,
  createRequestCancellation,
  handleInferenceQueueError
} from '../src/middleware/requestCancellation.js';

const createExchange = () => {
  const req = Object.assign(new EventEmitter(), { aborted: false });
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    writableFinished: false
  });
  return { req, res };
};

describe('request cancellation', () => {
  it('allows writes only while both sides of the exchange remain writable', () => {
    const { req, res } = createExchange();

    expect(canWriteInferenceResponse(req, res)).toBe(true);
    req.aborted = true;
    expect(canWriteInferenceResponse(req, res)).toBe(false);
    req.aborted = false;
    res.destroyed = true;
    expect(canWriteInferenceResponse(req, res)).toBe(false);
    res.destroyed = false;
    res.writableEnded = true;
    expect(canWriteInferenceResponse(req, res)).toBe(false);
  });

  it('does not abort for a normal response finish and cleans up listeners', () => {
    const { req, res } = createExchange();
    const cancellation = createRequestCancellation(req, res);

    res.writableFinished = true;
    res.emit('finish');
    res.emit('close');
    cancellation.cleanup();

    expect(cancellation.signal.aborted).toBe(false);
    expect(req.listenerCount('aborted')).toBe(0);
    expect(res.listenerCount('finish')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it.each(['request aborted', 'response closed'])(
    'aborts once when the %s prematurely', scenario => {
      const { req, res } = createExchange();
      const cancellation = createRequestCancellation(req, res);
      const abortListener = vi.fn();
      cancellation.signal.addEventListener('abort', abortListener);

      if (scenario === 'request aborted') {
        req.aborted = true;
        req.emit('aborted');
      } else {
        res.destroyed = true;
        res.emit('close');
      }
      req.emit('aborted');
      res.emit('close');
      cancellation.cleanup();

      expect(cancellation.signal.aborted).toBe(true);
      expect(cancellation.isDisconnected()).toBe(true);
      expect(abortListener).toHaveBeenCalledOnce();
      expect(req.listenerCount('aborted')).toBe(0);
      expect(res.listenerCount('finish')).toBe(0);
      expect(res.listenerCount('close')).toBe(0);
    }
  );

  it.each([
    { aborted: true, destroyed: false },
    { aborted: false, destroyed: true }
  ])('detects an already disconnected exchange: %j', initial => {
    const { req, res } = createExchange();
    Object.assign(req, { aborted: initial.aborted });
    Object.assign(res, { destroyed: initial.destroyed });

    const cancellation = createRequestCancellation(req, res);
    cancellation.cleanup();
    cancellation.cleanup();

    expect(cancellation.signal.aborted).toBe(true);
    expect(cancellation.isDisconnected()).toBe(true);
  });

  it('does not treat a close after a writable finish as a disconnect', () => {
    const { req, res } = createExchange();
    const cancellation = createRequestCancellation(req, res);

    res.writableFinished = true;
    res.emit('close');

    expect(cancellation.signal.aborted).toBe(false);
    cancellation.cleanup();
  });

  it('maps queue errors only when they require a response', () => {
    const { req, res } = createExchange();
    res.setHeader = vi.fn();
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    const aborted = Object.assign(new Error('aborted'), { code: 'INFERENCE_QUEUE_ABORTED' });
    const full = Object.assign(new Error('full'), { code: 'INFERENCE_QUEUE_FULL' });

    expect(handleInferenceQueueError(new Error('other'), req, res)).toBe(false);
    expect(handleInferenceQueueError(aborted, req, res)).toBe(true);
    expect(handleInferenceQueueError(full, req, res)).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'inference_queue_full' });

    req.aborted = true;
    res.setHeader.mockClear();
    expect(handleInferenceQueueError(full, req, res)).toBe(true);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
