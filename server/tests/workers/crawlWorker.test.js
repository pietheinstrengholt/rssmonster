import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dependencyMocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  claimProcessingJobs: vi.fn(),
  closeDatabase: vi.fn(),
  executeProcessingJob: vi.fn(),
  loadProcessingJobOperationalSnapshot: vi.fn(),
  processingJobLogContext: vi.fn(),
  recordRecoveredProcessingJobLease: vi.fn(),
  recoverExpiredProcessingJobs: vi.fn(),
  runCrawl: vi.fn()
}));

// This mock exposes controllable Sequelize lifecycle behavior to the lazy dependency loader.
vi.mock('../../models/index.js', () => ({
  default: {
    sequelize: {
      authenticate: dependencyMocks.authenticate,
      close: dependencyMocks.closeDatabase,
      getDialect: () => 'mysql'
    }
  }
}));

// This mock prevents worker lifecycle tests from starting the production crawl pipeline.
vi.mock('../../scripts/runSemanticPipeline.js', () => ({
  runSemanticPipeline: dependencyMocks.runCrawl
}));

vi.mock('../../services/jobs/crawlPriorityLease.js', () => ({
  withCrawlPriorityLease: operation => operation()
}));

vi.mock('../../services/jobs/processingJobQueue.js', () => ({
  claimProcessingJobs: dependencyMocks.claimProcessingJobs,
  recoverExpiredProcessingJobs: dependencyMocks.recoverExpiredProcessingJobs
}));

vi.mock('../../services/jobs/processingJobHandlers.js', () => ({
  executeClaimedProcessingJob: dependencyMocks.executeProcessingJob,
  processingJobLogContext: dependencyMocks.processingJobLogContext,
  recordRecoveredProcessingJobLease: dependencyMocks.recordRecoveredProcessingJobLease
}));

vi.mock('../../services/jobs/processingJobObservability.js', () => ({
  loadProcessingJobOperationalSnapshot: dependencyMocks.loadProcessingJobOperationalSnapshot
}));

import {
  createCrawlWorker,
  getProcessingJobWorkerConfig,
  isWorkerEntryPoint,
  parseWorkerInterval
} from '../../src/workers/crawlWorker.js';

const originalExitCode = process.exitCode;

const createWorkerDependencies = (overrides = {}) => ({
  claimProcessingJobs: vi.fn().mockResolvedValue([]),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
  databaseDialect: 'mysql',
  executeProcessingJob: vi.fn().mockResolvedValue({ status: 'succeeded' }),
  recoverExpiredProcessingJobs: vi.fn().mockResolvedValue([]),
  runCrawl: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

// This test suite verifies scheduling and shutdown without connecting to feeds or MySQL.
describe('crawl worker', () => {
  // This setup restores successful lazy dependencies before each worker lifecycle test.
  beforeEach(() => {
    dependencyMocks.authenticate.mockReset().mockResolvedValue(undefined);
    dependencyMocks.closeDatabase.mockReset().mockResolvedValue(undefined);
    dependencyMocks.claimProcessingJobs.mockReset().mockResolvedValue([]);
    dependencyMocks.executeProcessingJob.mockReset().mockResolvedValue({ status: 'succeeded' });
    dependencyMocks.loadProcessingJobOperationalSnapshot.mockReset().mockResolvedValue({
      event: 'processing_jobs.snapshot'
    });
    dependencyMocks.processingJobLogContext.mockReset().mockReturnValue({});
    dependencyMocks.recordRecoveredProcessingJobLease.mockReset().mockResolvedValue(undefined);
    dependencyMocks.recoverExpiredProcessingJobs.mockReset().mockResolvedValue([]);
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

  it('validates optional processing-loop configuration', () => {
    expect(getProcessingJobWorkerConfig({})).toEqual({
      enabled: true,
      pollIntervalMs: 1000,
      concurrency: 1,
      shutdownTimeoutMs: 30_000,
      reportIntervalMs: 60_000
    });
    expect(getProcessingJobWorkerConfig({
      PROCESSING_JOB_WORKER_ENABLED: 'false',
      PROCESSING_JOB_POLL_INTERVAL_MS: '2500',
      PROCESSING_JOB_CONCURRENCY: '3',
      PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS: '5000',
      PROCESSING_JOB_REPORT_INTERVAL_MS: '15000'
    })).toEqual({
      enabled: false,
      pollIntervalMs: 2500,
      concurrency: 3,
      shutdownTimeoutMs: 5000,
      reportIntervalMs: 15_000
    });
    expect(() => getProcessingJobWorkerConfig({
      PROCESSING_JOB_CONCURRENCY: '0'
    })).toThrow(/positive finite integer/);
    expect(() => getProcessingJobWorkerConfig({
      PROCESSING_JOB_WORKER_ENABLED: 'sometimes'
    })).toThrow(/must be true or false/);
  });

  // This test verifies the default loader authenticates, runs, and closes its lazy dependencies.
  it('loads and closes the default crawl dependencies', async () => {
    dependencyMocks.runCrawl.mockImplementation(async () => {
      void worker.shutdown('test complete');
    });
    const worker = createCrawlWorker({
      intervalMs: 1,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencyMocks.authenticate).toHaveBeenCalledOnce();
    expect(dependencyMocks.runCrawl).toHaveBeenCalledOnce();
    expect(dependencyMocks.closeDatabase).toHaveBeenCalledOnce();
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

  it('runs both loops concurrently while crawl-critical work pauses new job claims', async () => {
    let finishFirstCrawl;
    let finishJob;
    const firstCrawl = new Promise(resolve => {
      finishFirstCrawl = resolve;
    });
    const jobExecution = new Promise(resolve => {
      finishJob = resolve;
    });
    const job = { id: 'job-1' };
    let crawlCount = 0;
    const dependencies = createWorkerDependencies({
      runCrawl: vi.fn(async () => {
        crawlCount++;
        if (crawlCount === 1) await firstCrawl;
      }),
      claimProcessingJobs: vi.fn()
        .mockResolvedValueOnce([job])
        .mockResolvedValue([]),
      executeProcessingJob: vi.fn(() => jobExecution)
    });
    const worker = createCrawlWorker({
      intervalMs: 20,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    const workerPromise = worker.start();
    await vi.waitFor(() => expect(dependencies.runCrawl).toHaveBeenCalledOnce());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(dependencies.claimProcessingJobs).not.toHaveBeenCalled();

    finishFirstCrawl();
    await vi.waitFor(() => expect(dependencies.executeProcessingJob).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ));
    await vi.waitFor(() => expect(
      dependencies.runCrawl.mock.calls.length
    ).toBeGreaterThanOrEqual(2));
    const shutdownPromise = worker.shutdown('test complete');
    expect(dependencies.closeDatabase).not.toHaveBeenCalled();
    finishJob({ status: 'succeeded' });

    await shutdownPromise;
    await workerPromise;
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });

  it('keeps crawling after a processing claim iteration fails', async () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    let crawlCount = 0;
    const dependencies = createWorkerDependencies({
      runCrawl: vi.fn(async () => {
        crawlCount++;
        if (crawlCount === 2) void worker.shutdown('test complete');
      }),
      claimProcessingJobs: vi.fn().mockRejectedValue(new Error('test claim failure'))
    });
    const worker = createCrawlWorker({
      intervalMs: 20,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencies.runCrawl).toHaveBeenCalledTimes(2);
    expect(dependencies.claimProcessingJobs).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[CrawlWorker] Processing-job claim iteration failed:',
      expect.any(Error)
    );
  });

  it('keeps processing jobs after a crawl iteration fails', async () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    const job = { id: 'job-after-crawl-failure' };
    const dependencies = createWorkerDependencies({
      runCrawl: vi.fn().mockRejectedValue(new Error('test crawl failure')),
      claimProcessingJobs: vi.fn().mockResolvedValueOnce([job]),
      executeProcessingJob: vi.fn(async () => {
        void worker.shutdown('test complete');
        return { status: 'succeeded' };
      })
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencies.executeProcessingJob).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Crawl iteration failed'),
      expect.any(Error)
    );
  });

  it('stops claims and waits for bounded in-flight processing before closing once', async () => {
    let finishJob;
    const jobExecution = new Promise(resolve => {
      finishJob = resolve;
    });
    const dependencies = createWorkerDependencies({
      claimProcessingJobs: vi.fn()
        .mockResolvedValueOnce([{ id: 'shutdown-job' }])
        .mockResolvedValue([]),
      executeProcessingJob: vi.fn(() => jobExecution)
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    const workerPromise = worker.start();
    await vi.waitFor(() => expect(dependencies.executeProcessingJob).toHaveBeenCalledOnce());
    const claimsBeforeShutdown = dependencies.claimProcessingJobs.mock.calls.length;
    const shutdownPromise = worker.shutdown('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(dependencies.claimProcessingJobs).toHaveBeenCalledTimes(claimsBeforeShutdown);
    expect(dependencies.closeDatabase).not.toHaveBeenCalled();
    finishJob({ status: 'succeeded' });

    await shutdownPromise;
    await workerPromise;
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });

  it('does not dispatch jobs returned by a claim that finishes after shutdown', async () => {
    let finishClaim;
    const pendingClaim = new Promise(resolve => {
      finishClaim = resolve;
    });
    const dependencies = createWorkerDependencies({
      claimProcessingJobs: vi.fn(() => pendingClaim)
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    const workerPromise = worker.start();
    await vi.waitFor(() => expect(dependencies.claimProcessingJobs).toHaveBeenCalledOnce());
    const shutdownPromise = worker.shutdown('SIGTERM');
    finishClaim([{ id: 'leased-during-shutdown' }]);

    await shutdownPromise;
    await workerPromise;
    expect(dependencies.executeProcessingJob).not.toHaveBeenCalled();
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });

  it('aborts in-flight processing after the configured shutdown grace period', async () => {
    let receivedSignal;
    const dependencies = createWorkerDependencies({
      claimProcessingJobs: vi.fn().mockResolvedValueOnce([{ id: 'abort-job' }]),
      executeProcessingJob: vi.fn((_job, { signal }) => {
        receivedSignal = signal;
        return new Promise(resolve => {
          signal.addEventListener('abort', () => resolve({ status: 'pending' }), { once: true });
        });
      })
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      processingJobShutdownTimeoutMs: 10,
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    const workerPromise = worker.start();
    await vi.waitFor(() => expect(dependencies.executeProcessingJob).toHaveBeenCalledOnce());
    await worker.shutdown('SIGTERM');
    await workerPromise;

    expect(receivedSignal.aborted).toBe(true);
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });

  it('forces SQLite processing concurrency to one', async () => {
    const healthReporter = vi.fn().mockResolvedValue(undefined);
    const dependencies = createWorkerDependencies({
      databaseDialect: 'sqlite',
      claimProcessingJobs: vi.fn(async () => {
        void worker.shutdown('test complete');
        return [];
      })
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      processingJobConcurrency: 4,
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false,
      healthReporter
    });

    await worker.start();

    expect(dependencies.recoverExpiredProcessingJobs).toHaveBeenCalledWith({ limit: 1 });
    expect(dependencies.claimProcessingJobs).toHaveBeenCalledWith({ limit: 1 });
    expect(healthReporter.mock.calls.some(([state]) => (
      state.processingJobs.concurrency === 1
    ))).toBe(true);
  });

  it('continues into claiming when startup lease recovery fails', async () => {
    const logger = { error: vi.fn(), log: vi.fn() };
    const dependencies = createWorkerDependencies({
      recoverExpiredProcessingJobs: vi.fn().mockRejectedValue(new Error('recovery failed')),
      claimProcessingJobs: vi.fn(async () => {
        void worker.shutdown('test complete');
        return [];
      })
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencies.recoverExpiredProcessingJobs).toHaveBeenCalledOnce();
    expect(dependencies.claimProcessingJobs).toHaveBeenCalledOnce();
    expect(dependencies.recoverExpiredProcessingJobs.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.claimProcessingJobs.mock.invocationCallOrder[0]
    );
    expect(logger.error).toHaveBeenCalledWith(
      '[CrawlWorker] Processing-job lease recovery failed:',
      expect.any(Error)
    );
  });

  it('logs and records each bounded expired-lease recovery', async () => {
    const recoveredJob = {
      id: 'recovered-job',
      type: 'semantic_label',
      attempts: 2,
      userId: 8,
      payload: { targetType: 'event', targetId: 22 }
    };
    const logger = { error: vi.fn(), log: vi.fn() };
    const dependencies = createWorkerDependencies({
      recoverExpiredProcessingJobs: vi.fn().mockResolvedValue([recoveredJob]),
      processingJobLogContext: vi.fn().mockReturnValue({
        jobId: recoveredJob.id,
        type: recoveredJob.type,
        attempt: 2,
        userId: 8,
        target: { targetType: 'event', targetId: 22 }
      }),
      recordRecoveredProcessingJobLease: vi.fn().mockResolvedValue(undefined),
      claimProcessingJobs: vi.fn(async () => {
        void worker.shutdown('test complete');
        return [];
      })
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger,
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencies.recordRecoveredProcessingJobLease).toHaveBeenCalledWith(recoveredJob);
    expect(logger.log).toHaveBeenCalledWith({
      event: 'processing_job.lease_recovered',
      jobId: recoveredJob.id,
      type: recoveredJob.type,
      attempt: 2,
      userId: 8,
      target: { targetType: 'event', targetId: 22 }
    });
  });

  it('reports a structured operational queue snapshot through logs and health', async () => {
    const snapshot = {
      event: 'processing_jobs.snapshot',
      pendingByType: { article_enrichment: 2 },
      oldestPendingJobAgeMs: 5000,
      runningCount: 1,
      retryCount: 1,
      deadJobCount: 3,
      completionCount: 10,
      failureCount: 3,
      processingLatencyMs: { sampleSize: 2, average: 100, maximum: 150 }
    };
    const logger = { error: vi.fn(), log: vi.fn() };
    const healthReporter = vi.fn().mockResolvedValue(undefined);
    const dependencies = createWorkerDependencies({
      loadProcessingJobOperationalSnapshot: vi.fn().mockResolvedValue(snapshot),
      claimProcessingJobs: vi.fn(async () => {
        void worker.shutdown('test complete');
        return [];
      })
    });
    const worker = createCrawlWorker({
      intervalMs: 60_000,
      processingJobPollIntervalMs: 1,
      processingJobReportIntervalMs: 1,
      loadDependencies: async () => dependencies,
      logger,
      registerProcessHandlers: false,
      healthReporter
    });

    await worker.start();

    expect(dependencies.loadProcessingJobOperationalSnapshot).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(snapshot);
    expect(healthReporter.mock.calls.some(([state]) => (
      state.processingJobs.operationalSnapshot === snapshot
    ))).toBe(true);
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
