import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createRequestCancellation } from '../src/middleware/requestCancellation.js';

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
});
