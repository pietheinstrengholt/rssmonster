import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencyMocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  closeDatabase: vi.fn(),
  runCrawl: vi.fn()
}));

// This mock exposes controllable Sequelize lifecycle behavior to the lazy dependency loader.
vi.mock('../../models/index.js', () => ({
  default: {
    sequelize: {
      authenticate: dependencyMocks.authenticate,
      close: dependencyMocks.closeDatabase
    }
  }
}));

// This mock prevents worker lifecycle tests from starting the production crawl pipeline.
vi.mock('../../scripts/runSemanticPipeline.js', () => ({
  runSemanticPipeline: dependencyMocks.runCrawl
}));

import {
  createCrawlWorker,
  isWorkerEntryPoint,
  parseWorkerInterval
} from '../../src/workers/crawlWorker.js';

const originalExitCode = process.exitCode;

const createWorkerDependencies = (overrides = {}) => ({
  closeDatabase: vi.fn().mockResolvedValue(undefined),
  runCrawl: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

// This test suite verifies scheduling and shutdown without connecting to feeds or MySQL.
describe('crawl worker', () => {
  // This setup restores successful lazy dependencies before each worker lifecycle test.
  beforeEach(() => {
    dependencyMocks.authenticate.mockReset().mockResolvedValue(undefined);
    dependencyMocks.closeDatabase.mockReset().mockResolvedValue(undefined);
    dependencyMocks.runCrawl.mockReset().mockResolvedValue(undefined);
    process.exitCode = 0;
  });

  // This cleanup keeps worker exit codes and module spies isolated from later tests.
  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  // This test verifies PM2's process container still launches the worker lifecycle.
  it('recognizes direct Node and PM2 entry points', () => {
    const workerPath = new URL('../../src/workers/crawlWorker.js', import.meta.url).pathname;

    expect(isWorkerEntryPoint({ argv: ['node', workerPath], env: {} })).toBe(true);
    expect(isWorkerEntryPoint({
      argv: ['node', '/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js'],
      env: { pm_exec_path: workerPath }
    })).toBe(true);
    expect(isWorkerEntryPoint({ argv: ['node', '/tmp/importer.js'], env: {} })).toBe(false);
    expect(isWorkerEntryPoint({ argv: ['node'], env: {} })).toBe(false);
  });

  // This test verifies the documented default and strict interval validation.
  it('validates the polling interval', () => {
    expect(parseWorkerInterval(undefined)).toBe(60_000);
    expect(parseWorkerInterval('')).toBe(60_000);
    expect(parseWorkerInterval('2500')).toBe(2500);
    expect(() => parseWorkerInterval('0')).toThrow(/positive finite integer/);
    expect(() => parseWorkerInterval('1.5')).toThrow(/positive finite integer/);
    expect(() => parseWorkerInterval('invalid')).toThrow(/positive finite integer/);
  });

  // This test verifies the default loader authenticates, runs, and closes its lazy dependencies.
  it('loads and closes the default crawl dependencies', async () => {
    dependencyMocks.runCrawl.mockImplementation(async () => {
      void worker.shutdown('test complete');
    });
    const logger = { error: vi.fn(), log: vi.fn() };
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencyMocks.authenticate).toHaveBeenCalledOnce();
    expect(dependencyMocks.runCrawl).toHaveBeenCalledOnce();
    expect(dependencyMocks.closeDatabase).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      '[CrawlWorker] Starting crawl worker interval=60s'
    );
  });

  it('never consumes processing jobs even when queue methods are supplied', async () => {
    const claimProcessingJobs = vi.fn();
    const executeProcessingJob = vi.fn();
    const recoverExpiredProcessingJobs = vi.fn();
    const dependencies = createWorkerDependencies({
      claimProcessingJobs,
      executeProcessingJob,
      recoverExpiredProcessingJobs
    });
    const worker = createCrawlWorker({
      intervalMs: 1,
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });
    dependencies.runCrawl.mockImplementation(async () => {
      void worker.shutdown('test complete');
    });

    await worker.start();

    expect(dependencies.runCrawl).toHaveBeenCalledOnce();
    expect(claimProcessingJobs).not.toHaveBeenCalled();
    expect(executeProcessingJob).not.toHaveBeenCalled();
    expect(recoverExpiredProcessingJobs).not.toHaveBeenCalled();
  });

  // This test verifies failed authentication preserves the root error after cleanup also fails.
  it('cleans up after dependency authentication fails', async () => {
    const authenticationError = new Error('test authentication failure');
    const cleanupError = new Error('test initialization cleanup failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    dependencyMocks.authenticate.mockRejectedValue(authenticationError);
    dependencyMocks.closeDatabase.mockRejectedValue(cleanupError);
    const worker = createCrawlWorker({
      intervalMs: 1,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    await expect(worker.start()).rejects.toBe(authenticationError);

    expect(dependencyMocks.closeDatabase).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      '[CrawlWorker] Database cleanup after initialization failed:',
      cleanupError
    );
  });

  // This test verifies a failed iteration is logged and the next iteration still runs.
  it('continues after an iteration failure', async () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    const healthReporter = vi.fn().mockResolvedValue(undefined);
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
      registerProcessHandlers: false,
      healthReporter
    });

    await worker.start();

    expect(runCrawl).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Crawl iteration failed'),
      expect.any(Error)
    );
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(healthReporter.mock.calls.map(([state]) => [
      state.status,
      state.consecutiveFailures
    ])).toEqual([
      ['starting', 0],
      ['running', 0],
      ['degraded', 1],
      ['running', 1],
      ['healthy', 0],
      ['stopping', 0]
    ]);
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

  // This test verifies installed process handlers request shutdown and are removed afterward.
  it('handles process signals and fatal process errors', async () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    const closeDatabase = vi.fn().mockResolvedValue(undefined);
    let resolveDependencies;
    const dependenciesReady = new Promise(resolve => {
      resolveDependencies = resolve;
    });
    const eventNames = ['SIGTERM', 'SIGINT', 'unhandledRejection', 'uncaughtException'];
    const originalListeners = new Map(
      eventNames.map(eventName => [eventName, process.listeners(eventName)])
    );
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      loadDependencies: () => dependenciesReady,
      logger
    });

    const workerPromise = worker.start();
    const workerListeners = new Map(eventNames.map(eventName => [
      eventName,
      process.listeners(eventName).find(listener => (
        !originalListeners.get(eventName).includes(listener)
      ))
    ]));
    const rejectionError = new Error('test rejection');
    const exceptionError = new Error('test exception');

    workerListeners.get('SIGTERM')();
    workerListeners.get('SIGINT')();
    workerListeners.get('unhandledRejection')(rejectionError);
    workerListeners.get('uncaughtException')(exceptionError);
    resolveDependencies({ closeDatabase, runCrawl: vi.fn() });
    await workerPromise;

    expect(logger.log).toHaveBeenCalledWith('[CrawlWorker] Shutdown requested: SIGTERM');
    expect(logger.error).toHaveBeenCalledWith(
      '[CrawlWorker] Fatal unhandled rejection:',
      rejectionError
    );
    expect(logger.error).toHaveBeenCalledWith(
      '[CrawlWorker] Fatal uncaught exception:',
      exceptionError
    );
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    eventNames.forEach(eventName => {
      expect(process.listeners(eventName)).toEqual(originalListeners.get(eventName));
    });
  });

  // This test verifies cleanup errors set a failure exit code without rejecting shutdown.
  it('records database cleanup failures', async () => {
    const cleanupError = new Error('test database cleanup failure');
    const logger = { error: vi.fn(), log: vi.fn() };
    const runCrawl = vi.fn(async () => {
      void worker.shutdown('test complete');
    });
    const worker = createCrawlWorker({
      intervalMs: 1,
      loadDependencies: async () => ({
        closeDatabase: vi.fn().mockRejectedValue(cleanupError),
        runCrawl
      }),
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(logger.error).toHaveBeenCalledWith(
      '[CrawlWorker] Database cleanup failed:',
      cleanupError
    );
    expect(process.exitCode).toBe(1);
  });

  // This test verifies shutdown before start and repeated starts preserve one lifecycle promise.
  it('keeps start and shutdown idempotent', async () => {
    const stoppedWorker = createCrawlWorker({
      intervalMs: 1,
      loadDependencies: async () => ({
        closeDatabase: vi.fn(),
        runCrawl: vi.fn()
      }),
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    await expect(stoppedWorker.shutdown()).resolves.toBeUndefined();
    const firstStart = stoppedWorker.start();
    const secondStart = stoppedWorker.start();

    expect(secondStart).toBe(firstStart);
    await firstStart;
  });

  // This test verifies direct execution reports invalid startup configuration as a fatal error.
  it('handles initialization failure when loaded as the process entry point', async () => {
    const workerPath = new URL('../../src/workers/crawlWorker.js', import.meta.url).pathname;
    const originalArgv = process.argv;
    const originalInterval = process.env.CRAWL_WORKER_INTERVAL_MS;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.argv = ['node', workerPath];
    process.env.CRAWL_WORKER_INTERVAL_MS = 'invalid';

    try {
      await import('../../src/workers/crawlWorker.js?entrypoint-test');
    } finally {
      process.argv = originalArgv;
      if (typeof originalInterval === 'undefined') {
        delete process.env.CRAWL_WORKER_INTERVAL_MS;
      } else {
        process.env.CRAWL_WORKER_INTERVAL_MS = originalInterval;
      }
    }

    expect(consoleError).toHaveBeenCalledWith(
      '[CrawlWorker] Initialization failed:',
      expect.objectContaining({
        message: expect.stringContaining('positive finite integer')
      })
    );
    expect(process.exitCode).toBe(1);
  });
});
