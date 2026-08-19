import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { getConfig } from './config/config.js';
import { initializeConfiguredModels } from './configuredModelStartup.js';

dotenv.config({ quiet: true });

// Load the app only after dotenv so provider selection sees inference/.env.
const { default: app } = await import('./app.js');

export const startServer = async () => {
  const { host, port } = getConfig();
  await initializeConfiguredModels({ embeddingService: app.locals.embeddingService });
  const server = app.listen(port, host, () => {
    console.log(`[INFERENCE] Listening on http://${host}:${port}`);
  });

  let shuttingDown = false;
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[INFERENCE] ${signal} received, shutting down`);

    server.close(error => {
      if (error) {
        console.error('[INFERENCE] Shutdown failed:', error);
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return server;
};

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  try {
    await startServer();
  } catch (error) {
    console.error('[INFERENCE] Startup failed:', error);
    process.exitCode = 1;
  }
}
