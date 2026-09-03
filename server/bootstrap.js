// server/bootstrap.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDir, '.env'), quiet: true });
console.log('Environment variables loaded from .env file if present.');
console.log('Starting application.');
const { startCacheRefresh, startServer } = await import('./app.js');
await startServer();
startCacheRefresh();

try {
  const { getEmailConfiguration } = await import('./config/email.js');
  const emailConfiguration = getEmailConfiguration();
  if (emailConfiguration.enabled) {
    const { createEmailDeliveryWorker } = await import(
      './services/email/emailDeliveryWorker.js'
    );
    const emailWorker = createEmailDeliveryWorker({
      configuration: emailConfiguration,
      logger: console
    });
    void emailWorker.start();
  } else {
    console.log('[EmailWorker] disabled');
  }
} catch (error) {
  console.error(
    '[EmailWorker] startup.failed errorCode=' +
    JSON.stringify(error?.code || error?.name || 'UNKNOWN_ERROR')
  );
}
