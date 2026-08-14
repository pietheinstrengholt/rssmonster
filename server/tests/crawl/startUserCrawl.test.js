import { describe, expect, it, vi } from 'vitest';
import { createStartUserCrawl } from '../../services/crawl/startUserCrawl.js';

describe('startUserCrawl', () => {
  it('resolves when a new crawl run is created without waiting for completion', async () => {
    let finishCrawl;
    const completion = new Promise(resolve => {
      finishCrawl = resolve;
    });
    const runUserCrawl = vi.fn(async (userId, options) => {
      options.onCrawlStarted({
        userId,
        crawlRunId: 17,
        status: 'running',
        reused: false,
        reason: null
      });
      return completion;
    });
    const onComplete = vi.fn();

    const result = await createStartUserCrawl(runUserCrawl)(4, { onComplete });

    expect(result).toEqual({
      userId: 4,
      crawlRunId: 17,
      status: 'running',
      reused: false,
      reason: null
    });
    expect(onComplete).not.toHaveBeenCalled();

    const completed = { crawlRunId: 17, processed: 2 };
    finishCrawl(completed);
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith(completed));
  });

  it('returns the active run when a repeated request is reused', async () => {
    const runUserCrawl = vi.fn(async (userId, options) => {
      const started = {
        userId,
        crawlRunId: 23,
        status: 'running',
        reused: true,
        reason: 'crawl_already_running'
      };
      options.onCrawlStarted(started);
      return started;
    });

    const result = await createStartUserCrawl(runUserCrawl)(5);

    expect(result).toMatchObject({
      crawlRunId: 23,
      status: 'running',
      reused: true,
      reason: 'crawl_already_running'
    });
  });

  it('requires an authenticated positive user ID', async () => {
    const runUserCrawl = vi.fn();
    const startUserCrawl = createStartUserCrawl(runUserCrawl);

    await expect(startUserCrawl(null)).rejects.toThrow(
      'A positive authenticated userId is required'
    );
    expect(runUserCrawl).not.toHaveBeenCalled();
  });
});
