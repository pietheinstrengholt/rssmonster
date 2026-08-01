import { describe, expect, it, vi } from 'vitest';
import {
  createCrawlWorker,
  parseWorkerInterval
} from '../../src/workers/crawlWorker.js';

// This test suite verifies scheduling and shutdown without connecting to feeds or MySQL.
describe('crawl worker', () => {
  // This test verifies the documented default and strict interval validation.
  it('validates the polling interval', () => {
    expect(parseWorkerInterval(undefined)).toBe(60_000);
    expect(parseWorkerInterval('2500')).toBe(2500);
    expect(() => parseWorkerInterval('0')).toThrow(/positive finite integer/);
    expect(() => parseWorkerInterval('1.5')).toThrow(/positive finite integer/);
    expect(() => parseWorkerInterval('invalid')).toThrow(/positive finite integer/);
  });

  // This test verifies a failed iteration is logged and the next iteration still runs.
  it('continues after an iteration failure', async () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    const closeDatabase = vi.fn().mockResolvedValue(undefined);
    let iterationCount = 0;
    const runCrawl = vi.fn(async () => {
      iterationCount++;

      if (iterationCount === 1) {
        throw new Error('test crawl failure');
      }

      void worker.shutdown('test complete');
    });

    const worker = createCrawlWorker({
      intervalMs: 1,
      loadDependencies: async () => ({ closeDatabase, runCrawl }),
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(runCrawl).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Crawl iteration failed'),
      expect.any(Error)
    );
    expect(closeDatabase).toHaveBeenCalledOnce();
  });

  // This test verifies shutdown interrupts a long polling sleep and closes Sequelize promptly.
  it('interrupts polling sleep during shutdown', async () => {
    const closeDatabase = vi.fn().mockResolvedValue(undefined);
    let markIterationComplete;
    const iterationComplete = new Promise(resolve => {
      markIterationComplete = resolve;
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      loadDependencies: async () => ({
        closeDatabase,
        runCrawl: async () => markIterationComplete()
      }),
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    const workerPromise = worker.start();
    await iterationComplete;
    await new Promise(resolve => setTimeout(resolve, 10));

    const shutdownStartedAt = Date.now();
    await worker.shutdown('SIGTERM');

    expect(Date.now() - shutdownStartedAt).toBeLessThan(1000);
    expect(closeDatabase).toHaveBeenCalledOnce();
    await workerPromise;
  });
});
