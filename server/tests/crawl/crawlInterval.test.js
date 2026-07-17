import { afterEach, describe, expect, it, vi } from 'vitest';
import crawlController, { withTimeout } from '../../controllers/crawl.js';

describe('crawl interval controls', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows feeds whose interval has elapsed', () => {
    const feed = {
      lastFetched: new Date('2026-07-01T00:00:00Z'),
      updateIntervalMinutes: 20
    };
    const now = new Date('2026-07-01T00:30:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(true);
  });

  it('skips feeds whose interval has not elapsed', () => {
    const feed = {
      lastFetched: new Date('2026-07-01T00:00:00Z'),
      updateIntervalMinutes: 20
    };
    const now = new Date('2026-07-01T00:10:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(false);
  });

  it('allows feeds without lastFetched or interval values', () => {
    expect(crawlController.shouldCrawlFeed({ lastFetched: null, updateIntervalMinutes: 60 })).toBe(true);
    expect(crawlController.shouldCrawlFeed({ lastFetched: new Date(), updateIntervalMinutes: null })).toBe(true);
  });

  it('skips feeds set to never crawl automatically', () => {
    const feed = {
      lastFetched: new Date('2026-07-01T00:00:00Z'),
      updateIntervalMinutes: 0
    };
    const now = new Date('2026-07-01T00:30:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(false);
  });

  it('waits for timed-out feed work to settle before rejecting', async () => {
    vi.useFakeTimers();
    let resolveOperation;
    let operationSignal;
    let completed = false;
    const operation = new Promise(resolve => {
      resolveOperation = resolve;
    });
    const resultPromise = withTimeout(signal => {
      operationSignal = signal;
      return operation;
    }, 1000);
    void resultPromise.finally(() => {
      completed = true;
    }).catch(() => {});

    await vi.advanceTimersByTimeAsync(1000);

    expect(operationSignal.aborted).toBe(true);
    expect(completed).toBe(false);

    resolveOperation();

    await expect(resultPromise).rejects.toThrow(
      'Feed processing timed out after 1 seconds'
    );
    expect(completed).toBe(true);
  });
});
