import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerFile = fileURLToPath(import.meta.url);
const serverDirectory = path.resolve(path.dirname(workerFile), '../..');
dotenv.config({ path: path.join(serverDirectory, '.env'), quiet: true });

const DEFAULT_INTERVAL_MS = 60_000;

// This function recognizes direct Node and PM2 launches without starting on imports.
export const isWorkerEntryPoint = ({ argv = process.argv, env = process.env } = {}) => {
  const entryPath = env.pm_exec_path || argv[1];
  return Boolean(entryPath) && path.resolve(entryPath) === workerFile;
};

// This function validates the worker polling interval before database initialization.
export const parseWorkerInterval = value => {
  if (typeof value === 'undefined' || value === '') {
    return DEFAULT_INTERVAL_MS;
  }

  const intervalMs = Number(value);
  if (!Number.isFinite(intervalMs) || !Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new Error(
      'CRAWL_WORKER_INTERVAL_MS must be a positive finite integer in milliseconds.'
    );
  }

  return intervalMs;
};

// This function loads and authenticates the existing crawl pipeline dependencies.
const loadCrawlDependencies = async () => {
  const [{ default: db }, { runSemanticPipeline }] = await Promise.all([
    import('../../models/index.js'),
    import('../../scripts/runSemanticPipeline.js')
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
    closeDatabase: () => db.sequelize.close(),
    runCrawl: runSemanticPipeline
  };
};

// This function creates an interruptible, single-iteration crawl worker lifecycle.
export const createCrawlWorker = ({
  intervalMs = parseWorkerInterval(process.env.CRAWL_WORKER_INTERVAL_MS),
  loadDependencies = loadCrawlDependencies,
  logger = console,
  registerProcessHandlers = true
} = {}) => {
  let dependencies;
  let runPromise;
  let stopping = false;
  let wakeSleep;
  let requestedExitCode = 0;

  // This function wakes the polling delay so shutdown does not wait for the interval.
  const interruptSleep = () => {
    wakeSleep?.();
    wakeSleep = undefined;
  };

  // This function stops future iterations while allowing current crawl work to settle.
  const shutdown = (reason = 'shutdown requested', exitCode = 0) => {
    requestedExitCode = Math.max(requestedExitCode, exitCode);

    if (!stopping) {
      stopping = true;
      logger.log(`[CrawlWorker] Shutdown requested: ${reason}`);
      interruptSleep();
    }

    return runPromise || Promise.resolve();
  };

  // This function waits for the next poll or resolves immediately when interrupted.
  const sleep = () => new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      wakeSleep = undefined;
      resolve();
    }, intervalMs);

    wakeSleep = () => {
      clearTimeout(timeoutId);
      resolve();
    };
  });

  // This function translates process signals into an orderly worker shutdown.
  const handleSignal = signal => {
    void shutdown(signal);
  };

  // This function identifies SIGTERM as the requested shutdown reason.
  const handleSigterm = () => {
    handleSignal('SIGTERM');
  };

  // This function identifies SIGINT as the requested shutdown reason.
  const handleSigint = () => {
    handleSignal('SIGINT');
  };

  // This function logs fatal process errors and requests a non-zero orderly shutdown.
  const handleFatalError = (kind, error) => {
    logger.error(`[CrawlWorker] Fatal ${kind}:`, error);
    process.exitCode = 1;
    void shutdown(kind, 1);
  };

  // This function records an unhandled rejection as a fatal worker error.
  const handleUnhandledRejection = reason => {
    handleFatalError('unhandled rejection', reason);
  };

  // This function records an uncaught exception as a fatal worker error.
  const handleUncaughtException = error => {
    handleFatalError('uncaught exception', error);
  };

  // This function installs process lifecycle handlers before initialization begins.
  const installProcessHandlers = () => {
    if (!registerProcessHandlers) return;

    process.once('SIGTERM', handleSigterm);
    process.once('SIGINT', handleSigint);
    process.on('unhandledRejection', handleUnhandledRejection);
    process.on('uncaughtException', handleUncaughtException);
  };

  // This function removes worker-owned handlers after database cleanup completes.
  const removeProcessHandlers = () => {
    if (!registerProcessHandlers) return;

    process.removeListener('SIGTERM', handleSigterm);
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('unhandledRejection', handleUnhandledRejection);
    process.removeListener('uncaughtException', handleUncaughtException);
  };

  // This function runs immediate and subsequent crawl iterations sequentially.
  const runLoop = async () => {
    logger.log(`[CrawlWorker] Starting with intervalMs=${intervalMs}`);
    installProcessHandlers();

    try {
      dependencies = await loadDependencies();

      while (!stopping) {
        const startedAt = Date.now();
        logger.log('[CrawlWorker] Crawl iteration started.');

        try {
          await dependencies.runCrawl();
          logger.log(
            `[CrawlWorker] Crawl iteration completed in ${Date.now() - startedAt}ms.`
          );
        } catch (error) {
          logger.error(
            `[CrawlWorker] Crawl iteration failed after ${Date.now() - startedAt}ms:`,
            error
          );
        }

        if (!stopping) {
          await sleep();
        }
      }
    } finally {
      interruptSleep();

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

  // This function starts the worker once and returns its complete lifecycle promise.
  const start = () => {
    if (!runPromise) {
      runPromise = runLoop();
    }

    return runPromise;
  };

  return { shutdown, start };
};

// This function starts the production worker when this module is the Node entry point.
const runMain = async () => {
  try {
    const worker = createCrawlWorker();
    await worker.start();
  } catch (error) {
    console.error('[CrawlWorker] Initialization failed:', error);
    process.exitCode = 1;
  }
};

if (isWorkerEntryPoint()) {
  await runMain();
}
