import { createCrawlWorker } from '../server/src/workers/crawlWorker.js';
import { createCrawlWorkerHealthReporter } from '../server/src/workers/crawlWorkerHealth.js';
import { configureDesktopDatabase } from './database.js';

// Use the production worker and pipeline with only Desktop's interval and lifecycle inputs.
export const startDesktopCrawlWorker = async (port, initialSettings) => {
  const { default: db } = await import('../server/models/index.js');
  configureDesktopDatabase(db);
  const { runSemanticPipeline } = await import('../server/scripts/runSemanticPipeline.js');
  let settings = initialSettings;
  const reportHealth = createCrawlWorkerHealthReporter();
  const send = state => port.postMessage({ type: 'activity', ...state });
  const worker = createCrawlWorker({
    registerProcessHandlers: false,
    intervalMs: settings.refreshIntervalMinutes * 60_000,
    loadDependencies: async () => ({
      closeDatabase: () => db.sequelize.close(),
      // Archiving remains available through existing administration actions; Desktop adds no nightly job.
      getIntervalMs: async () => {
        const interval = settings.refreshIntervalMinutes * 60_000;
        send({ nextRefreshAt: new Date(Date.now() + interval).toISOString() });
        return interval;
      },
      runCrawl: async () => {
        try {
          const result = await runSemanticPipeline();
          send({ lastCompletedAt: new Date().toISOString(), result: result.crawl });
        } finally {
          if (!settings.automaticRefresh) void worker.shutdown('Manual refresh completed');
        }
      }
    }),
    healthReporter: async state => {
      await reportHealth(state);
      send({ workerStatus: state.status, nextRefreshAt: null });
    }
  });
  port.on('message', ({ data }) => {
    if (data?.type === 'configure') { settings = data.settings; worker.wake(); }
    if (data === 'refresh') worker.wake();
  });
  return worker;
};
