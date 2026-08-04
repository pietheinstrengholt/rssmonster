import { afterEach, describe, expect, it, vi } from 'vitest';
import crawlController, { withTimeout } from '../../controllers/crawl.js';
import db from '../../models/index.js';

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

  it('allows feeds with invalid intervals or fetch timestamps to recover', () => {
    expect(crawlController.shouldCrawlFeed({
      lastFetched: new Date(),
      updateIntervalMinutes: -1
    })).toBe(true);
    expect(crawlController.shouldCrawlFeed({
      lastFetched: 'not-a-date',
      updateIntervalMinutes: 60
    })).toBe(true);
  });

  it('acknowledges HTTP crawl triggers and contains asynchronous failures', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = {
      json: vi.fn(),
      status: vi.fn()
    };
    res.json.mockReturnValue(res);
    res.status.mockReturnValue(res);

    crawlController.crawlRssLinks(
      { userData: { userId: 2147483647 } },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Crawling started.' });
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        'Error during async crawl:',
        expect.any(Error)
      );
    });
    logSpy.mockRestore();
    errorSpy.mockRestore();
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

    crawlController.crawlRssLinks(
      { userData: { userId: user.id } },
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(200);
    await vi.waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Crawl completed:')
      );
    });
    logSpy.mockRestore();
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
