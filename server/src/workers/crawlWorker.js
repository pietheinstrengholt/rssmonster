import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCrawlWorkerHealthReporter } from './crawlWorkerHealth.js';

const workerFile = fileURLToPath(import.meta.url);
const serverDirectory = path.resolve(path.dirname(workerFile), '../..');
dotenv.config({ path: path.join(serverDirectory, '.env'), quiet: true });

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_PROCESSING_JOB_POLL_INTERVAL_MS = 1000;
const DEFAULT_PROCESSING_JOB_CONCURRENCY = 1;
const DEFAULT_PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS = 30_000;
const DEFAULT_PROCESSING_JOB_REPORT_INTERVAL_MS = 60_000;

export const isWorkerEntryPoint = ({ argv = process.argv, env = process.env } = {}) => {
  const entryPath = env.pm_exec_path || argv[1];
  return Boolean(entryPath) && path.resolve(entryPath) === workerFile;
};

const positiveInteger = (value, fallback, name) => {
  if (typeof value === 'undefined' || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive finite integer.`);
  }
  return parsed;
};

export const parseWorkerInterval = value => positiveInteger(
  value,
  DEFAULT_INTERVAL_MS,
  'CRAWL_WORKER_INTERVAL_MS'
);

const enabledFlag = (value, fallback = true) => {
  if (typeof value === 'undefined' || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error('PROCESSING_JOB_WORKER_ENABLED must be true or false.');
};

export const getProcessingJobWorkerConfig = (environment = process.env) => ({
  enabled: enabledFlag(environment.PROCESSING_JOB_WORKER_ENABLED),
  pollIntervalMs: positiveInteger(
    environment.PROCESSING_JOB_POLL_INTERVAL_MS,
    DEFAULT_PROCESSING_JOB_POLL_INTERVAL_MS,
    'PROCESSING_JOB_POLL_INTERVAL_MS'
  ),
  concurrency: positiveInteger(
    environment.PROCESSING_JOB_CONCURRENCY,
    DEFAULT_PROCESSING_JOB_CONCURRENCY,
    'PROCESSING_JOB_CONCURRENCY'
  ),
  shutdownTimeoutMs: positiveInteger(
    environment.PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS,
    DEFAULT_PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS,
    'PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS'
  ),
  reportIntervalMs: positiveInteger(
    environment.PROCESSING_JOB_REPORT_INTERVAL_MS,
    DEFAULT_PROCESSING_JOB_REPORT_INTERVAL_MS,
    'PROCESSING_JOB_REPORT_INTERVAL_MS'
  )
});

// Loads one shared dependency graph for both independently supervised loops.
const loadCrawlDependencies = async () => {
  const [
    { default: db },
    { runSemanticPipeline },
    { withCrawlPriorityLease },
    processingQueue,
    processingHandlers,
    processingObservability
  ] = await Promise.all([
    import('../../models/index.js'),
    import('../../scripts/runSemanticPipeline.js'),
    import('../../services/jobs/crawlPriorityLease.js'),
    import('../../services/jobs/processingJobQueue.js'),
    import('../../services/jobs/processingJobHandlers.js'),
    import('../../services/jobs/processingJobObservability.js')
  ]);

  try {
    await db.sequelize.authenticate();
  } catch (error) {
    await db.sequelize.close().catch(closeError => {
      console.error('[CrawlWorker] Database cleanup after initialization failed:', closeError);
    });
    throw error;
  }

  return {
    claimProcessingJobs: processingQueue.claimProcessingJobs,
    closeDatabase: () => db.sequelize.close(),
    databaseDialect: db.sequelize.getDialect(),
    executeProcessingJob: processingHandlers.executeClaimedProcessingJob,
    loadProcessingJobOperationalSnapshot:
      processingObservability.loadProcessingJobOperationalSnapshot,
    processingJobLogContext: processingHandlers.processingJobLogContext,
    recordRecoveredProcessingJobLease:
      processingHandlers.recordRecoveredProcessingJobLease,
    recoverExpiredProcessingJobs: processingQueue.recoverExpiredProcessingJobs,
    runCrawl: () => withCrawlPriorityLease(runSemanticPipeline)
  };
};

const componentHealth = (status = 'starting') => ({
  status,
  consecutiveFailures: 0,
  lastAttemptAt: null,
  lastSuccessAt: null
});

export const createCrawlWorker = ({
  intervalMs = parseWorkerInterval(process.env.CRAWL_WORKER_INTERVAL_MS),
  processingJobsEnabled = getProcessingJobWorkerConfig().enabled,
  processingJobPollIntervalMs = getProcessingJobWorkerConfig().pollIntervalMs,
  processingJobConcurrency = getProcessingJobWorkerConfig().concurrency,
  processingJobShutdownTimeoutMs = getProcessingJobWorkerConfig().shutdownTimeoutMs,
  processingJobReportIntervalMs = getProcessingJobWorkerConfig().reportIntervalMs,
  loadDependencies = loadCrawlDependencies,
  logger = console,
  registerProcessHandlers = true,
  healthReporter
} = {}) => {
  let dependencies;
  let runPromise;
  let stopping = false;
  let crawlCriticalActive = false;
  let wakeCrawlSleep;
  let wakeProcessingSleep;
  let requestedExitCode = 0;
  let effectiveProcessingConcurrency = processingJobConcurrency;
  let processingEnabled = processingJobsEnabled;
  let healthReportPromise = Promise.resolve();
  let lastProcessingJobReportAt = 0;
  const inFlightProcessingJobs = new Set();
  const processingAbortController = new AbortController();
  const crawlHealth = componentHealth();
  const processingHealth = {
    ...componentHealth(processingJobsEnabled ? 'starting' : 'disabled'),
    enabled: processingJobsEnabled,
    inFlight: 0,
    concurrency: processingJobConcurrency,
    lastClaimedAt: null,
    operationalSnapshot: null
  };

  const overallStatus = explicitStatus => {
    if (explicitStatus) return explicitStatus;
    if (crawlHealth.status === 'running' || processingHealth.status === 'running') return 'running';
    if (crawlHealth.consecutiveFailures > 0 || processingHealth.consecutiveFailures > 0) {
      return 'degraded';
    }
    return 'healthy';
  };

  // Serializes writes to the single process-health file.
  const reportHealth = async explicitStatus => {
    if (!healthReporter) return;
    const snapshot = {
      status: overallStatus(explicitStatus),
      // Preserve the legacy crawl fields while adding component-specific health.
      consecutiveFailures: crawlHealth.consecutiveFailures,
      lastAttemptAt: crawlHealth.lastAttemptAt,
      lastSuccessAt: crawlHealth.lastSuccessAt,
      crawl: { ...crawlHealth, criticalPipelineActive: crawlCriticalActive },
      processingJobs: { ...processingHealth }
    };
    healthReportPromise = healthReportPromise
      .catch(() => {})
      .then(() => healthReporter(snapshot));
    await healthReportPromise;
  };

  const interruptCrawlSleep = () => {
    wakeCrawlSleep?.();
    wakeCrawlSleep = undefined;
  };

  const interruptProcessingSleep = () => {
    wakeProcessingSleep?.();
    wakeProcessingSleep = undefined;
  };

  const interruptSleeps = () => {
    interruptCrawlSleep();
    interruptProcessingSleep();
  };

  const interruptibleSleep = (delayMs, setWake) => new Promise(resolve => {
    const timeoutId = setTimeout(resolve, delayMs);
    setWake(() => {
      clearTimeout(timeoutId);
      resolve();
    });
  });

  const crawlSleep = () => interruptibleSleep(intervalMs, wake => {
    wakeCrawlSleep = wake;
  }).finally(() => {
    wakeCrawlSleep = undefined;
  });

  const processingSleep = () => interruptibleSleep(processingJobPollIntervalMs, wake => {
    wakeProcessingSleep = wake;
  }).finally(() => {
    wakeProcessingSleep = undefined;
  });

  const shutdown = (reason = 'shutdown requested', exitCode = 0) => {
    requestedExitCode = Math.max(requestedExitCode, exitCode);
    if (!stopping) {
      stopping = true;
      logger.log(`[CrawlWorker] Shutdown requested: ${reason}`);
      interruptSleeps();
    }
    return runPromise || Promise.resolve();
  };

  const handleSignal = signal => {
    void shutdown(signal);
  };
  const handleSigterm = () => handleSignal('SIGTERM');
  const handleSigint = () => handleSignal('SIGINT');
  const handleFatalError = (kind, error) => {
    logger.error(`[CrawlWorker] Fatal ${kind}:`, error);
    process.exitCode = 1;
    void shutdown(kind, 1);
  };
  const handleUnhandledRejection = reason => handleFatalError('unhandled rejection', reason);
  const handleUncaughtException = error => handleFatalError('uncaught exception', error);

  const installProcessHandlers = () => {
    if (!registerProcessHandlers) return;
    process.once('SIGTERM', handleSigterm);
    process.once('SIGINT', handleSigint);
    process.on('unhandledRejection', handleUnhandledRejection);
    process.on('uncaughtException', handleUncaughtException);
  };

  const removeProcessHandlers = () => {
    if (!registerProcessHandlers) return;
    process.removeListener('SIGTERM', handleSigterm);
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('unhandledRejection', handleUnhandledRejection);
    process.removeListener('uncaughtException', handleUncaughtException);
  };

  // runSemanticPipeline owns crawl → embedding → events → topics → island scoring ordering.
  const runCrawlLoop = async () => {
    while (!stopping) {
      const startedAt = Date.now();
      crawlHealth.status = 'running';
      crawlHealth.lastAttemptAt = new Date(startedAt).toISOString();
      crawlCriticalActive = true;

      try {
        await reportHealth();
        logger.log('[CrawlWorker] Crawl iteration started.');
        await dependencies.runCrawl();
        crawlHealth.status = 'healthy';
        crawlHealth.consecutiveFailures = 0;
        crawlHealth.lastSuccessAt = new Date().toISOString();
        logger.log(`[CrawlWorker] Crawl iteration completed in ${Date.now() - startedAt}ms.`);
      } catch (error) {
        crawlHealth.status = 'degraded';
        crawlHealth.consecutiveFailures++;
        logger.error(
          `[CrawlWorker] Crawl iteration failed after ${Date.now() - startedAt}ms:`,
          error
        );
      } finally {
        crawlCriticalActive = false;
        interruptProcessingSleep();
        await reportHealth();
      }

      if (!stopping) await crawlSleep();
    }
  };

  const trackProcessingJob = job => {
    const task = Promise.resolve()
      .then(() => dependencies.executeProcessingJob(job, {
        signal: processingAbortController.signal,
        logger
      }))
      .then(result => {
        processingHealth.consecutiveFailures = result?.status === 'succeeded'
          ? 0
          : processingHealth.consecutiveFailures + 1;
        processingHealth.status = result?.status === 'succeeded' ? 'healthy' : 'degraded';
        if (result?.status === 'succeeded') {
          processingHealth.lastSuccessAt = new Date().toISOString();
        }
      })
      .catch(error => {
        processingHealth.status = 'degraded';
        processingHealth.consecutiveFailures++;
        logger.error({
          event: 'processing_job.execution_failed_abnormally',
          ...(dependencies.processingJobLogContext?.(job) || { jobId: job?.id || null }),
          errorCode: error?.code || error?.name || 'PROCESSING_JOB_EXECUTION_FAILED'
        });
      })
      .finally(() => {
        inFlightProcessingJobs.delete(task);
        processingHealth.inFlight = inFlightProcessingJobs.size;
        interruptProcessingSleep();
        void reportHealth().catch(error => {
          logger.error('[CrawlWorker] Processing health update failed:', error);
        });
      });
    inFlightProcessingJobs.add(task);
    processingHealth.inFlight = inFlightProcessingJobs.size;
  };

  const recoverExpiredLeases = async () => {
    try {
      const recoveredJobs = await dependencies.recoverExpiredProcessingJobs({
        limit: effectiveProcessingConcurrency
      });
      for (const job of recoveredJobs) {
        logger.log({
          event: 'processing_job.lease_recovered',
          ...(dependencies.processingJobLogContext?.(job) || { jobId: job?.id || null })
        });
      }
      if (dependencies.recordRecoveredProcessingJobLease) {
        await Promise.allSettled(
          recoveredJobs.map(job => dependencies.recordRecoveredProcessingJobLease(job))
        );
      }
    } catch (error) {
      processingHealth.status = 'degraded';
      processingHealth.consecutiveFailures++;
      logger.error('[CrawlWorker] Processing-job lease recovery failed:', error);
    }
  };

  const reportProcessingJobOperations = async ({ force = false } = {}) => {
    if (!dependencies.loadProcessingJobOperationalSnapshot) return;
    const now = Date.now();
    if (!force && now - lastProcessingJobReportAt < processingJobReportIntervalMs) return;
    lastProcessingJobReportAt = now;
    try {
      const snapshot = await dependencies.loadProcessingJobOperationalSnapshot();
      processingHealth.operationalSnapshot = snapshot;
      logger.log(snapshot);
    } catch (error) {
      processingHealth.status = 'degraded';
      processingHealth.consecutiveFailures++;
      logger.error({
        event: 'processing_jobs.snapshot_failed',
        errorCode: error?.code || error?.name || 'PROCESSING_JOB_SNAPSHOT_FAILED'
      });
    }
  };

  // This loop never blocks crawling and pauses only new claims during crawl-critical work.
  const runProcessingLoop = async () => {
    if (!processingEnabled || stopping) return;
    let recoveredExpiredLeases = false;

    while (!stopping) {
      if (crawlCriticalActive || inFlightProcessingJobs.size >= effectiveProcessingConcurrency) {
        processingHealth.status = crawlCriticalActive ? 'paused' : 'running';
        await reportHealth();
        await processingSleep();
        continue;
      }

      await reportProcessingJobOperations();

      if (!recoveredExpiredLeases) {
        await recoverExpiredLeases();
        recoveredExpiredLeases = true;
        if (stopping) break;
      }

      processingHealth.status = 'running';
      processingHealth.lastAttemptAt = new Date().toISOString();
      await reportHealth();
      try {
        const availableSlots = effectiveProcessingConcurrency - inFlightProcessingJobs.size;
        const jobs = await dependencies.claimProcessingJobs({ limit: availableSlots });
        // A claim already in progress may finish after SIGTERM; leave those leases recoverable.
        if (stopping) break;
        if (jobs.length > 0) {
          processingHealth.consecutiveFailures = 0;
          processingHealth.lastClaimedAt = new Date().toISOString();
          jobs.forEach(trackProcessingJob);
          continue;
        }
        processingHealth.status = 'healthy';
        processingHealth.consecutiveFailures = 0;
        processingHealth.lastSuccessAt = new Date().toISOString();
      } catch (error) {
        processingHealth.status = 'degraded';
        processingHealth.consecutiveFailures++;
        logger.error('[CrawlWorker] Processing-job claim iteration failed:', error);
      }
      await reportHealth();
      if (!stopping) await processingSleep();
    }
  };

  const settleProcessingJobs = async () => {
    if (inFlightProcessingJobs.size === 0) return;
    const settled = Promise.allSettled([...inFlightProcessingJobs]);
    let timeoutId;
    const timedOut = await Promise.race([
      settled.then(() => false),
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(true), processingJobShutdownTimeoutMs);
      })
    ]);
    clearTimeout(timeoutId);
    if (!timedOut) return;

    logger.log('[CrawlWorker] Aborting processing jobs that exceeded the shutdown grace period.');
    processingAbortController.abort(new Error('Worker shutdown grace period expired'));
    await Promise.race([
      Promise.allSettled([...inFlightProcessingJobs]),
      new Promise(resolve => setTimeout(
        resolve,
        Math.min(processingJobShutdownTimeoutMs, 5000)
      ))
    ]);
  };

  const superviseLoop = async (name, loop, restartSleep) => {
    while (!stopping) {
      try {
        await loop();
        return;
      } catch (error) {
        logger.error(`[CrawlWorker] ${name} loop supervision failure:`, error);
        if (!stopping) await restartSleep();
      }
    }
  };

  const runLoop = async () => {
    logger.log(
      `[CrawlWorker] Starting with intervalMs=${intervalMs} ` +
      `processingJobsEnabled=${processingJobsEnabled}`
    );
    installProcessHandlers();

    try {
      await reportHealth('starting');
      dependencies = await loadDependencies();
      const hasProcessingDependencies = [
        dependencies.claimProcessingJobs,
        dependencies.executeProcessingJob,
        dependencies.recoverExpiredProcessingJobs
      ].every(dependency => typeof dependency === 'function');
      processingEnabled = processingJobsEnabled && hasProcessingDependencies;
      effectiveProcessingConcurrency = dependencies.databaseDialect === 'sqlite'
        ? 1
        : processingJobConcurrency;
      Object.assign(processingHealth, {
        enabled: processingEnabled,
        status: processingEnabled ? 'starting' : 'disabled',
        concurrency: effectiveProcessingConcurrency
      });

      const crawlLoop = superviseLoop('Crawl', runCrawlLoop, crawlSleep);
      const processingLoop = superviseLoop(
        'Processing-job',
        runProcessingLoop,
        processingSleep
      );
      await Promise.all([crawlLoop, processingLoop]);
      await settleProcessingJobs();
    } finally {
      interruptSleeps();
      crawlHealth.status = 'stopping';
      processingHealth.status = processingEnabled ? 'stopping' : 'disabled';
      await reportHealth('stopping').catch(error => {
        requestedExitCode = 1;
        logger.error('[CrawlWorker] Health-state cleanup failed:', error);
      });

      if (dependencies) {
        try {
          await dependencies.closeDatabase();
          logger.log('[CrawlWorker] Database connections closed.');
        } catch (error) {
          requestedExitCode = 1;
          logger.error('[CrawlWorker] Database cleanup failed:', error);
        }
      }

      removeProcessHandlers();
      process.exitCode = Math.max(process.exitCode || 0, requestedExitCode);
      logger.log('[CrawlWorker] Shutdown complete.');
    }
  };

  const start = () => {
    if (!runPromise) runPromise = runLoop();
    return runPromise;
  };

  return { shutdown, start };
};

const runMain = async () => {
  try {
    const worker = createCrawlWorker({
      healthReporter: createCrawlWorkerHealthReporter()
    });
    await worker.start();
  } catch (error) {
    console.error('[CrawlWorker] Initialization failed:', error);
    process.exitCode = 1;
  }
};

if (isWorkerEntryPoint()) {
  await runMain();
}
