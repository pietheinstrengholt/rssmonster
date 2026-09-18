// server/bootstrap.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });
console.log('Environment variables loaded from .env file if present.');
console.log('Starting application.');
// --------------------
// Process-level safety
// --------------------
process.on('uncaughtException', err => {
  if (err?.name === 'RequestError') {
    console.error('UncaughtException:', err.message);
  } else {
    console.error('UncaughtException:', err);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

try {
  const { startCacheRefresh, startServer } = await import('./app.js');
  await startServer();
  startCacheRefresh();
} catch (error) {
  console.error('Startup failed:', error);
  process.exit(1);
}

try {
  const { createEmailDeliveryWorker } = await import('./services/email/emailDeliveryWorker.js');
  const { createDailyBriefingScheduler } = await import('./services/dailyBriefing/dailyBriefingScheduler.js');
  const emailWorker = createEmailDeliveryWorker({ logger: console });
  const dailyBriefingScheduler = createDailyBriefingScheduler({ logger: console });
  void emailWorker.start();
  void dailyBriefingScheduler.start();
} catch (error) {
  console.error(
    '[EmailWorker] startup.failed errorCode=' +
    JSON.stringify(error?.code || error?.name || 'UNKNOWN_ERROR')
  );
}
