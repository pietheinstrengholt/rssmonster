import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextArchivingTime, startNightlyArchiving } from '../../src/workers/nightlyArchiving.js';
import { createCrawlWorker } from '../../src/workers/crawlWorker.js';
import { execFileSync } from 'node:child_process';

let stop;
afterEach(async () => {
  await stop?.();
  stop = undefined;
  vi.useRealTimers();
});
const logger = () => ({ log: vi.fn(), error: vi.fn() });

describe('nightly archiving schedule', () => {
  it.each([
    ['2026-03-28T03:00:00+01:00', 23],
    ['2026-10-24T03:00:00+02:00', 25]
  ])('keeps 03:00 local across daylight-saving changes from %s', (start, hours) => {
    const moduleUrl = new URL('../../src/workers/nightlyArchiving.js', import.meta.url).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { nextArchivingTime } from ${JSON.stringify(moduleUrl)};
      const now = new Date(${JSON.stringify(start)});
      const next = nextArchivingTime(now);
      console.log(JSON.stringify({ hour: next.getHours(), elapsedHours: (next - now) / 3600000 }));
    `], { env: { ...process.env, TZ: 'Europe/Amsterdam' }, encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual({ hour: 3, elapsedHours: hours });
  });

  it('selects the next local 03:00, including month rollover', () => {
    expect(nextArchivingTime(new Date(2026, 0, 31, 2, 59))).toEqual(new Date(2026, 0, 31, 3));
    expect(nextArchivingTime(new Date(2026, 0, 31, 3))).toEqual(new Date(2026, 1, 1, 3));
    expect(nextArchivingTime(new Date(2026, 0, 31, 23))).toEqual(new Date(2026, 1, 1, 3));
  });

  it('runs at 03:00 and repeats the following night', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 2, 59));
    const runArchiving = vi.fn().mockResolvedValue(undefined);
    stop = startNightlyArchiving({ runArchiving, logger: logger() });
    await vi.advanceTimersByTimeAsync(59999);
    expect(runArchiving).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runArchiving).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(runArchiving).toHaveBeenCalledTimes(2);
  });

  it('logs failures and still schedules the next night', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 2, 59));
    const error = new Error('database unavailable');
    const runArchiving = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const logs = logger();
    stop = startNightlyArchiving({ runArchiving, logger: logs });
    await vi.advanceTimersByTimeAsync(60000);
    expect(logs.error).toHaveBeenCalledWith('[Archiving] Nightly cleanup failed:', error);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(runArchiving).toHaveBeenCalledTimes(2);
  });

  it('cancels the timer on shutdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 2, 59));
    const runArchiving = vi.fn();
    stop = startNightlyArchiving({ runArchiving, logger: logger() });
    await stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(runArchiving).not.toHaveBeenCalled();
  });

  it('does not overlap a long run and waits for it during shutdown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 2, 59));
    const pending = Promise.withResolvers();
    let shouldStop;
    const runArchiving = vi.fn(options => { shouldStop = options.shouldStop; return pending.promise; });
    stop = startNightlyArchiving({ runArchiving, logger: logger() });
    await vi.advanceTimersByTimeAsync(60000 + 24 * 60 * 60 * 1000);
    expect(runArchiving).toHaveBeenCalledTimes(1);
    expect(shouldStop()).toBe(false);
    const stopped = stop();
    expect(shouldStop()).toBe(true);
    pending.resolve();
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs during an active crawl and closes the database only after both operations settle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 2, 59));
    const crawl = Promise.withResolvers();
    const archiving = Promise.withResolvers();
    const closeDatabase = vi.fn();
    const runArchiving = vi.fn(() => archiving.promise);
    const worker = createCrawlWorker({
      intervalMs: 60000, registerProcessHandlers: false, logger: logger(),
      loadDependencies: async () => ({ closeDatabase, runCrawl: () => crawl.promise, runArchiving })
    });
    const running = worker.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(runArchiving).toHaveBeenCalledOnce();
    const shutdown = worker.shutdown('test');
    crawl.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(closeDatabase).not.toHaveBeenCalled();
    archiving.resolve();
    await shutdown;
    await running;
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
