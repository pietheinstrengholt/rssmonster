import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAiWorker,
  getAiWorkerConfig,
  isAiWorkerEntryPoint
} from '../../src/workers/aiWorker.js';

const originalExitCode = process.exitCode;

const dependenciesFor = overrides => ({
  claimProcessingJobs: vi.fn().mockResolvedValue([]),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
  databaseDialect: 'mysql',
  executeProcessingJob: vi.fn().mockResolvedValue({ status: 'succeeded' }),
  isCrawlPriorityLeaseActive: vi.fn().mockResolvedValue(false),
  loadProcessingJobOperationalSnapshot: vi.fn().mockResolvedValue({
    event: 'processing_jobs.snapshot'
  }),
  recordRecoveredProcessingJobLease: vi.fn().mockResolvedValue(undefined),
  recoverExpiredProcessingJobs: vi.fn().mockResolvedValue([]),
  ...overrides
});

const config = overrides => ({
  pollIntervalMs: 1,
  concurrency: 1,
  shutdownTimeoutMs: 100,
  reportIntervalMs: 60_000,
  ...overrides
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe('AI worker', () => {
  it('recognizes direct and PM2 entry points and validates configuration', () => {
    const workerPath = new URL('../../src/workers/aiWorker.js', import.meta.url).pathname;
    expect(isAiWorkerEntryPoint({ argv: ['node', workerPath], env: {} })).toBe(true);
    expect(isAiWorkerEntryPoint({
      argv: ['node', '/pm2/ProcessContainerFork.js'],
      env: { pm_exec_path: workerPath }
    })).toBe(true);
    expect(getAiWorkerConfig({})).toEqual({
      pollIntervalMs: 1000,
      concurrency: 1,
      shutdownTimeoutMs: 30_000,
      reportIntervalMs: 60_000
    });
  });

  it('pauses claims during the database-visible crawl lease and resumes afterward', async () => {
    const job = { id: 'job-after-crawl' };
    const dependencies = dependenciesFor({
      isCrawlPriorityLeaseActive: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false),
      claimProcessingJobs: vi.fn().mockResolvedValueOnce([job]),
      executeProcessingJob: vi.fn(async () => {
        void worker.shutdown('test complete');
        return { status: 'succeeded' };
      })
    });
    const healthReporter = vi.fn().mockResolvedValue(undefined);
    const worker = createAiWorker({
      config: config(),
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false,
      healthReporter
    });

    await worker.start();

    expect(healthReporter.mock.calls[0][0].status).toBe('starting');
    expect(dependencies.isCrawlPriorityLeaseActive).toHaveBeenCalledTimes(2);
    expect(dependencies.claimProcessingJobs).toHaveBeenCalledOnce();
    expect(dependencies.executeProcessingJob).toHaveBeenCalledOnce();
    expect(healthReporter.mock.calls.some(([state]) => state.status === 'paused')).toBe(true);
    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });

  it('forces SQLite concurrency to one', async () => {
    const dependencies = dependenciesFor({
      databaseDialect: 'sqlite',
      claimProcessingJobs: vi.fn(async () => {
        void worker.shutdown('test complete');
        return [];
      })
    });
    const healthReporter = vi.fn().mockResolvedValue(undefined);
    const worker = createAiWorker({
      config: config({ concurrency: 4 }),
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false,
      healthReporter
    });

    await worker.start();

    expect(dependencies.recoverExpiredProcessingJobs).toHaveBeenCalledWith({ limit: 1 });
    expect(dependencies.claimProcessingJobs).toHaveBeenCalledWith({ limit: 1 });
    expect(healthReporter.mock.calls.some(([state]) => state.concurrency === 1)).toBe(true);
  });

  it('retains operational snapshots in health reporting without logging them', async () => {
    const snapshot = {
      event: 'processing_jobs.snapshot',
      pendingByType: {},
      runningCount: 0
    };
    const dependencies = dependenciesFor({
      loadProcessingJobOperationalSnapshot: vi.fn().mockResolvedValue(snapshot)
    });
    const logger = { error: vi.fn(), log: vi.fn() };
    const healthReporter = vi.fn().mockResolvedValue(undefined);
    const worker = createAiWorker({
      config: config(),
      loadDependencies: async () => dependencies,
      logger,
      registerProcessHandlers: false,
      healthReporter
    });
    dependencies.claimProcessingJobs.mockImplementation(async () => {
      void worker.shutdown('test complete');
      return [];
    });

    await worker.start();

    expect(dependencies.loadProcessingJobOperationalSnapshot).toHaveBeenCalledOnce();
    expect(healthReporter.mock.calls.some(
      ([state]) => state.operationalSnapshot === snapshot
    )).toBe(true);
    expect(logger.log.mock.calls.some(([value]) => typeof value === 'object')).toBe(false);
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('processing_jobs.snapshot');
  });

  it('periodically recovers leases that expire after worker startup', async () => {
    const expiredJob = { id: 'expired-after-startup', status: 'dead' };
    let recoveryCalls = 0;
    const dependencies = dependenciesFor({
      recoverExpiredProcessingJobs: vi.fn(async () => {
        recoveryCalls += 1;
        if (recoveryCalls < 2) return [];
        void worker.shutdown('recovery observed');
        return [expiredJob];
      })
    });
    const worker = createAiWorker({
      config: config({ reportIntervalMs: 1 }),
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    await worker.start();

    expect(dependencies.recoverExpiredProcessingJobs.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(dependencies.recordRecoveredProcessingJobLease).toHaveBeenCalledWith(expiredJob);
  });

  it('waits for bounded in-flight work before closing the database', async () => {
    let finishJob;
    const jobExecution = new Promise(resolve => {
      finishJob = resolve;
    });
    const dependencies = dependenciesFor({
      claimProcessingJobs: vi.fn().mockResolvedValueOnce([{ id: 'slow-job' }]),
      executeProcessingJob: vi.fn(() => jobExecution)
    });
    const worker = createAiWorker({
      config: config(),
      loadDependencies: async () => dependencies,
      logger: { error: vi.fn(), log: vi.fn() },
      registerProcessHandlers: false
    });

    const workerPromise = worker.start();
    await vi.waitFor(() => expect(dependencies.executeProcessingJob).toHaveBeenCalledOnce());
    const shutdownPromise = worker.shutdown('SIGTERM');
    expect(dependencies.closeDatabase).not.toHaveBeenCalled();
    finishJob({ status: 'succeeded' });
    await shutdownPromise;
    await workerPromise;

    expect(dependencies.closeDatabase).toHaveBeenCalledOnce();
  });
});
