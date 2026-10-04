import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerFile = fileURLToPath(import.meta.url);
const serverDirectory = path.resolve(path.dirname(workerFile), '../..');
dotenv.config({ path: path.join(serverDirectory, '.env'), quiet: true });

const loadWebhookDependencies = async () => {
  const [{ default: db }, delivery] = await Promise.all([
    import('../../models/index.js'),
    import('../../services/webhookDelivery.js')
  ]);
  try {
    await db.sequelize.authenticate();
  } catch (error) {
    await db.sequelize.close().catch(() => {});
    throw error;
  }
  return {
    closeDatabase: () => db.sequelize.close(),
    dialect: db.sequelize.getDialect(),
    claim: delivery.claimWebhookDeliveries,
    expireFinalAttempts: delivery.expireFinalWebhookAttempts,
    process: delivery.processWebhookDelivery,
    policy: delivery.WEBHOOK_DELIVERY_POLICY
  };
};

export const isWebhookWorkerEntryPoint = ({ argv = process.argv, env = process.env } = {}) => {
  const entryPath = env.pm_exec_path || argv[1];
  return Boolean(entryPath) && path.resolve(entryPath) === workerFile;
};

export const createWebhookWorker = ({
  loadDependencies = loadWebhookDependencies,
  logger = console,
  registerProcessHandlers = true
} = {}) => {
  let dependencies;
  let runPromise;
  let stopping = false;
  let wakeSleep;
  const inFlight = new Set();
  const abortController = new AbortController();

  const sleep = ms => new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    wakeSleep = () => { clearTimeout(timer); resolve(); };
  }).finally(() => { wakeSleep = undefined; });
  const shutdown = () => {
    stopping = true;
    wakeSleep?.();
    return runPromise || Promise.resolve();
  };
  const handleSignal = () => { void shutdown(); };
  const handleFatal = error => {
    logger.error('[WebhookWorker] fatal', error?.code || error?.name || 'Error');
    process.exitCode = 1;
    void shutdown();
  };

  const track = delivery => {
    const task = dependencies.process(delivery, { signal: abortController.signal, logger })
      .catch(error => logger.error('[WebhookWorker] delivery.failed', JSON.stringify({
        deliveryId: delivery.id, errorCode: error?.code || error?.name || 'Error'
      })))
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  };

  const runLoop = async () => {
    if (registerProcessHandlers) {
      process.once('SIGTERM', handleSignal);
      process.once('SIGINT', handleSignal);
      process.on('unhandledRejection', handleFatal);
      process.on('uncaughtException', handleFatal);
    }
    try {
      dependencies = await loadDependencies();
      const concurrency = dependencies.dialect === 'sqlite' ? 1 : dependencies.policy.concurrency;
      logger.log(`[WebhookWorker] Starting concurrency=${concurrency}`);
      while (!stopping) {
        try {
          await dependencies.expireFinalAttempts();
          const available = concurrency - inFlight.size;
          if (available > 0) {
            const deliveries = await dependencies.claim({ limit: available });
            if (stopping) break;
            deliveries.forEach(track);
            if (deliveries.length) continue;
          }
        } catch (error) {
          logger.error('[WebhookWorker] poll.failed', error?.code || error?.name || 'Error');
        }
        if (!stopping) await sleep(dependencies.policy.pollIntervalMs);
      }
      const settled = Promise.allSettled([...inFlight]);
      const grace = dependencies.policy.requestTimeoutMs + 5_000;
      const completed = await Promise.race([
        settled.then(() => true),
        sleep(grace).then(() => false)
      ]);
      if (!completed) {
        abortController.abort();
        await Promise.race([settled, sleep(5_000)]);
      }
    } finally {
      wakeSleep?.();
      if (dependencies) await dependencies.closeDatabase();
      if (registerProcessHandlers) {
        process.removeListener('SIGTERM', handleSignal);
        process.removeListener('SIGINT', handleSignal);
        process.removeListener('unhandledRejection', handleFatal);
        process.removeListener('uncaughtException', handleFatal);
      }
      logger.log('[WebhookWorker] Shutdown complete.');
    }
  };

  const start = () => {
    if (!runPromise) runPromise = runLoop();
    return runPromise;
  };
  return { start, shutdown };
};

if (isWebhookWorkerEntryPoint()) {
  try {
    await createWebhookWorker().start();
  } catch (error) {
    console.error('[WebhookWorker] initialization.failed', error?.code || error?.name || 'Error');
    process.exitCode = 1;
  }
}
