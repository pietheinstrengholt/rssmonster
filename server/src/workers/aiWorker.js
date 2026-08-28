import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiWorkerHealthReporter } from './aiWorkerHealth.js';

const workerFile = fileURLToPath(import.meta.url);
const serverDirectory = path.resolve(path.dirname(workerFile), '../..');
dotenv.config({ path: path.join(serverDirectory, '.env'), quiet: true });

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;
const DEFAULT_REPORT_INTERVAL_MS = 60_000;
const MAX_LEASE_RECOVERY_INTERVAL_MS = 60_000;

const positiveInteger = (value, fallback, name) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive finite integer.`);
  }
  return parsed;
};

export const isAiWorkerEntryPoint = ({ argv = process.argv, env = process.env } = {}) => {
  const entryPath = env.pm_exec_path || argv[1];
  return Boolean(entryPath) && path.resolve(entryPath) === workerFile;
};

export const getAiWorkerConfig = (environment = process.env) => ({
  pollIntervalMs: positiveInteger(
    environment.PROCESSING_JOB_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    'PROCESSING_JOB_POLL_INTERVAL_MS'
  ),
  concurrency: positiveInteger(
    environment.PROCESSING_JOB_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    'PROCESSING_JOB_CONCURRENCY'
  ),
  shutdownTimeoutMs: positiveInteger(
    environment.PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS,
    DEFAULT_SHUTDOWN_TIMEOUT_MS,
    'PROCESSING_JOB_SHUTDOWN_TIMEOUT_MS'
  ),
  reportIntervalMs: positiveInteger(
    environment.PROCESSING_JOB_REPORT_INTERVAL_MS,
    DEFAULT_REPORT_INTERVAL_MS,
    'PROCESSING_JOB_REPORT_INTERVAL_MS'
  )
});

const loadAiWorkerDependencies = async () => {
  const [
    { default: db },
    processingQueue,
    processingHandlers,
    processingObservability,
    crawlPriority
  ] = await Promise.all([
    import('../../models/index.js'),
    import('../../services/jobs/processingJobQueue.js'),
    import('../../services/jobs/processingJobHandlers.js'),
    import('../../services/jobs/processingJobObservability.js'),
    import('../../services/jobs/crawlPriorityLease.js')
  ]);

  try {
    await db.sequelize.authenticate();
  } catch (error) {
    await db.sequelize.close().catch(closeError => {
      console.error('[AiWorker] Database cleanup after initialization failed:', closeError);
    });
    throw error;
  }

  return {
    claimProcessingJobs: processingQueue.claimProcessingJobs,
    closeDatabase: () => db.sequelize.close(),
    databaseDialect: db.sequelize.getDialect(),
    executeProcessingJob: processingHandlers.executeClaimedProcessingJob,
    formatProcessingJobLogLine: processingHandlers.formatProcessingJobLogLine,
    isCrawlPriorityLeaseActive: crawlPriority.isCrawlPriorityLeaseActive,
    loadProcessingJobOperationalSnapshot:
      processingObservability.loadProcessingJobOperationalSnapshot,
    recordRecoveredProcessingJobLease:
      processingHandlers.recordRecoveredProcessingJobLease,
    recoverExpiredProcessingJobs: processingQueue.recoverExpiredProcessingJobs
  };
};

export const createAiWorker = ({
  config = getAiWorkerConfig(),
  loadDependencies = loadAiWorkerDependencies,
  logger = console,
  registerProcessHandlers = true,
  healthReporter
} = {}) => {
  let dependencies;
  let runPromise;
  let stopping = false;
  let wakeSleep;
  let requestedExitCode = 0;
  let lastReportAt = 0;
  let lastLeaseRecoveryAt = 0;
  let effectiveConcurrency = config.concurrency;
  let healthReportPromise = Promise.resolve();
  const inFlightJobs = new Set();
  const abortController = new AbortController();
  const health = {
    status: 'starting',
    consecutiveFailures: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastClaimedAt: null,
    inFlight: 0,
    concurrency: config.concurrency,
    operationalSnapshot: null
  };

  const reportHealth = async explicitStatus => {
    if (!healthReporter) return;
    const snapshot = { ...health, ...(explicitStatus ? { status: explicitStatus } : {}) };
    healthReportPromise = healthReportPromise
      .catch(() => {})
      .then(() => healthReporter(snapshot));
    await healthReportPromise;
  };

  const sleep = () => new Promise(resolve => {
    const timeoutId = setTimeout(resolve, config.pollIntervalMs);
    wakeSleep = () => {
      clearTimeout(timeoutId);
      resolve();
    };
  }).finally(() => {
    wakeSleep = undefined;
  });

  const interruptSleep = () => {
    wakeSleep?.();
    wakeSleep = undefined;
  };

  const shutdown = (reason = 'shutdown requested', exitCode = 0) => {
    requestedExitCode = Math.max(requestedExitCode, exitCode);
    if (!stopping) {
      stopping = true;
      logger.log(`[AiWorker] Shutdown requested: ${reason}`);
      interruptSleep();
    }
    return runPromise || Promise.resolve();
  };

  const handleSignal = signal => void shutdown(signal);
  const handleSigterm = () => handleSignal('SIGTERM');
  const handleSigint = () => handleSignal('SIGINT');
  const handleFatalError = (kind, error) => {
    logger.error(`[AiWorker] Fatal ${kind}:`, error);
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

  const trackJob = job => {
    const task = Promise.resolve()
      .then(() => dependencies.executeProcessingJob(job, {
        signal: abortController.signal,
        logger
      }))
      .then(result => {
        health.consecutiveFailures = result?.status === 'succeeded'
          ? 0
          : health.consecutiveFailures + 1;
        health.status = result?.status === 'succeeded' ? 'healthy' : 'degraded';
        if (result?.status === 'succeeded') health.lastSuccessAt = new Date().toISOString();
      })
      .catch(error => {
        health.status = 'degraded';
        health.consecutiveFailures++;
        const errorCode = error?.code || error?.name || 'PROCESSING_JOB_EXECUTION_FAILED';
        logger.error(dependencies.formatProcessingJobLogLine?.(
          job,
          'processing_job.failed',
          { status: 'abnormal', errorCode }
        ) || `[AiWorker] processing_job.failed jobId=${JSON.stringify(job?.id || null)} ` +
          `status="abnormal" errorCode=${JSON.stringify(errorCode)}`);
      })
      .finally(() => {
        inFlightJobs.delete(task);
        health.inFlight = inFlightJobs.size;
        interruptSleep();
        void reportHealth().catch(error => logger.error('[AiWorker] Health update failed:', error));
      });
    inFlightJobs.add(task);
    health.inFlight = inFlightJobs.size;
  };

  const recoverExpiredLeases = async ({ force = false } = {}) => {
    const now = Date.now();
    const recoveryIntervalMs = Math.min(
      config.reportIntervalMs,
      MAX_LEASE_RECOVERY_INTERVAL_MS
    );
    if (!force && now - lastLeaseRecoveryAt < recoveryIntervalMs) return;
    lastLeaseRecoveryAt = now;
    try {
      const jobs = await dependencies.recoverExpiredProcessingJobs({ limit: effectiveConcurrency });
      if (jobs.length) {
        logger.log(`[AiWorker] processing_job.leases_recovered count=${jobs.length}`);
      }
      if (dependencies.recordRecoveredProcessingJobLease) {
        await Promise.allSettled(jobs.map(job => (
          dependencies.recordRecoveredProcessingJobLease(job)
        )));
      }
    } catch (error) {
      health.status = 'degraded';
      health.consecutiveFailures++;
      logger.error('[AiWorker] Processing-job lease recovery failed:', error);
    }
  };

  const reportOperations = async ({ force = false } = {}) => {
    if (!dependencies.loadProcessingJobOperationalSnapshot) return;
    const now = Date.now();
    if (!force && now - lastReportAt < config.reportIntervalMs) return;
    lastReportAt = now;
    try {
      const snapshot = await dependencies.loadProcessingJobOperationalSnapshot();
      health.operationalSnapshot = snapshot;
    } catch (error) {
      health.status = 'degraded';
      health.consecutiveFailures++;
      const errorCode = error?.code || error?.name || 'PROCESSING_JOB_SNAPSHOT_FAILED';
      logger.error(`[AiWorker] processing_jobs.snapshot_failed errorCode=${JSON.stringify(errorCode)}`);
    }
  };

  const settleJobs = async () => {
    if (inFlightJobs.size === 0) return;
    const settled = Promise.allSettled([...inFlightJobs]);
    let timeoutId;
    const timedOut = await Promise.race([
      settled.then(() => false),
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(true), config.shutdownTimeoutMs);
      })
    ]);
    clearTimeout(timeoutId);
    if (!timedOut) return;
    logger.log('[AiWorker] Aborting jobs that exceeded the shutdown grace period.');
    abortController.abort(new Error('AI worker shutdown grace period expired'));
    await Promise.race([
      Promise.allSettled([...inFlightJobs]),
      new Promise(resolve => setTimeout(resolve, Math.min(config.shutdownTimeoutMs, 5000)))
    ]);
  };

  const runLoop = async () => {
    logger.log(`[AiWorker] Starting concurrency=${config.concurrency}`);
    installProcessHandlers();
    try {
      await reportHealth('starting');
      dependencies = await loadDependencies();
      effectiveConcurrency = dependencies.databaseDialect === 'sqlite' ? 1 : config.concurrency;
      health.concurrency = effectiveConcurrency;
      await recoverExpiredLeases({ force: true });

      while (!stopping) {
        if (inFlightJobs.size >= effectiveConcurrency) {
          health.status = 'running';
          await reportHealth();
          await sleep();
          continue;
        }

        try {
          if (await dependencies.isCrawlPriorityLeaseActive()) {
            health.status = 'paused';
            await reportHealth();
            await sleep();
            continue;
          }
          await recoverExpiredLeases();
          await reportOperations();
          health.status = 'running';
          health.lastAttemptAt = new Date().toISOString();
          await reportHealth();
          const jobs = await dependencies.claimProcessingJobs({
            limit: effectiveConcurrency - inFlightJobs.size
          });
          if (stopping) break;
          if (jobs.length) {
            health.consecutiveFailures = 0;
            health.lastClaimedAt = new Date().toISOString();
            jobs.forEach(trackJob);
            continue;
          }
          health.status = 'healthy';
          health.consecutiveFailures = 0;
          health.lastSuccessAt = new Date().toISOString();
        } catch (error) {
          health.status = 'degraded';
          health.consecutiveFailures++;
          logger.error('[AiWorker] Processing iteration failed:', error);
        }
        await reportHealth();
        if (!stopping) await sleep();
      }
      await settleJobs();
    } finally {
      interruptSleep();
      await reportHealth('stopping').catch(error => {
        requestedExitCode = 1;
        logger.error('[AiWorker] Health-state cleanup failed:', error);
      });
      if (dependencies) {
        try {
          await dependencies.closeDatabase();
          logger.log('[AiWorker] Database connections closed.');
        } catch (error) {
          requestedExitCode = 1;
          logger.error('[AiWorker] Database cleanup failed:', error);
        }
      }
      removeProcessHandlers();
      process.exitCode = Math.max(process.exitCode || 0, requestedExitCode);
      logger.log('[AiWorker] Shutdown complete.');
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
    const worker = createAiWorker({ healthReporter: createAiWorkerHealthReporter() });
    await worker.start();
  } catch (error) {
    console.error('[AiWorker] Initialization failed:', error);
    process.exitCode = 1;
  }
};

if (isAiWorkerEntryPoint()) await runMain();
