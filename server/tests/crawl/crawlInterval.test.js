import { afterEach, describe, expect, it, vi } from 'vitest';
import crawlController, {
  resolveFeedMaxCount,
  resolveFeedParallelConcurrency,
  withTimeout
} from '../../controllers/crawl.js';
import db from '../../models/index.js';

describe('crawl interval controls', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows feeds whose interval has elapsed', () => {
    const feed = {
      nextFetchAt: new Date('2026-07-01T00:20:00Z'),
      updateIntervalMinutes: 20
    };
    const now = new Date('2026-07-01T00:30:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(true);
  });

  it('prefers FEED_MAX_COUNT while temporarily accepting legacy MAX_FEEDCOUNT', () => {
    expect(resolveFeedMaxCount({ FEED_MAX_COUNT: '25', MAX_FEEDCOUNT: '12' }))
      .toBe(25);
    expect(resolveFeedMaxCount({ MAX_FEEDCOUNT: '12' })).toBe(12);
    expect(resolveFeedMaxCount({})).toBe(10);
    expect(resolveFeedMaxCount({ FEED_MAX_COUNT: 'invalid', MAX_FEEDCOUNT: '12' }))
      .toBe(10);
  });

  it('uses a conservative configurable parallel feed concurrency', () => {
    expect(resolveFeedParallelConcurrency({ FEED_PARALLEL_CONCURRENCY: '4' })).toBe(4);
    expect(resolveFeedParallelConcurrency({ FEED_PARALLEL_CONCURRENCY: '0' })).toBe(3);
    expect(resolveFeedParallelConcurrency({ FEED_PARALLEL_CONCURRENCY: 'invalid' })).toBe(3);
    expect(resolveFeedParallelConcurrency({})).toBe(3);
  });

  it('skips feeds whose interval has not elapsed', () => {
    const feed = {
      nextFetchAt: new Date('2026-07-01T00:20:00Z'),
      updateIntervalMinutes: 20
    };
    const now = new Date('2026-07-01T00:10:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(false);
  });

  it('treats a missing nextFetchAt as no automatic schedule', () => {
    expect(crawlController.shouldCrawlFeed({ nextFetchAt: null, updateIntervalMinutes: 60 })).toBe(false);
    expect(crawlController.shouldCrawlFeed({ nextFetchAt: null, updateIntervalMinutes: null })).toBe(false);
  });

  it('honors nextFetchAt when no manual interval is configured', () => {
    expect(crawlController.shouldCrawlFeed({
      nextFetchAt: new Date('2026-07-01T01:00:00Z'),
      updateIntervalMinutes: null
    }, new Date('2026-07-01T00:00:00Z'))).toBe(false);
  });

  it('skips feeds set to never crawl automatically', () => {
    const feed = {
      nextFetchAt: null,
      updateIntervalMinutes: 0
    };
    const now = new Date('2026-07-01T00:30:00Z');

    expect(crawlController.shouldCrawlFeed(feed, now)).toBe(false);
  });

  it('allows feeds with invalid intervals or scheduling timestamps to recover', () => {
    expect(crawlController.shouldCrawlFeed({
      nextFetchAt: new Date(),
      updateIntervalMinutes: -1
    })).toBe(true);
    expect(crawlController.shouldCrawlFeed({
      nextFetchAt: 'not-a-date',
      updateIntervalMinutes: 60
    })).toBe(true);
  });

  it('does not use legacy lastFetched as the scheduling authority', () => {
    expect(crawlController.shouldCrawlFeed({
      lastFetched: new Date('2099-01-01T00:00:00Z'),
      nextFetchAt: null,
      updateIntervalMinutes: 60
    }, new Date('2026-07-01T00:00:00Z'))).toBe(false);
  });

  it('rejects HTTP crawl triggers that cannot create a user crawl run', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const next = vi.fn();
    const res = {
      json: vi.fn(),
      status: vi.fn()
    };
    res.json.mockReturnValue(res);
    res.status.mockReturnValue(res);

    await crawlController.crawlRssLinks(
      { userData: { userId: 2147483647 } },
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      name: 'SequelizeForeignKeyConstraintError'
    }));
    expect(res.status).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('completes an HTTP crawl trigger for a user without feeds', async () => {
    const user = await db.User.create({
      username: `crawl-trigger-${Date.now()}-${Math.random()}`,
      password: 'hashed-password',
      feverCredentialHash: `crawl-trigger-hash-${Date.now()}-${Math.random()}`,
      role: 'user'
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = {
      json: vi.fn(),
      status: vi.fn()
    };
    res.json.mockReturnValue(res);
    res.status.mockReturnValue(res);

    await crawlController.crawlRssLinks(
      { userData: { userId: user.id } },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Crawling started.',
      crawlRunId: expect.any(Number),
      status: 'running',
      reused: false
    });
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CRAWL] SUMMARY')
      );
    });
    logSpy.mockRestore();
  });

  it('rejects timed-out feed work without waiting for cooperative settlement', async () => {
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
    expect(completed).toBe(true);
    await expect(resultPromise).rejects.toThrow(
      'Feed processing timed out after 1 seconds'
    );
    resolveOperation();
    await Promise.resolve();
    expect(completed).toBe(true);
  });
});
