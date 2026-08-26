import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { getConfig } from './config/config.js';
import { getSafeErrorDetails, getSafeStartupErrorDetails } from './debug.js';

dotenv.config({ quiet: true });

// Load the app and startup providers only after dotenv so their singletons see inference/.env.
const [
  { default: app },
  { initializeConfiguredModels }
] = await Promise.all([
  import('./app.js'),
  import('./configuredModelStartup.js')
]);

const closeServer = server => new Promise((resolve, reject) => {
  server.close(error => error ? reject(error) : resolve());
});

export const startServer = async () => {
  const { host, port } = getConfig();
  let resolveListening;
  let rejectListening;
  const listening = new Promise((resolve, reject) => {
    resolveListening = resolve;
    rejectListening = reject;
  });
  const server = app.listen(port, host, () => {
    console.log(`[INFERENCE] Listening on http://${host}:${port}`);
    resolveListening();
  });
  server.once?.('error', rejectListening);

  let shuttingDown = false;
  const shutdown = signal => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.locals.readiness.transitionTo('shutting_down');
    console.log(`[INFERENCE] ${signal} received, shutting down`);

    server.close(error => {
      if (error) {
        console.error('[INFERENCE] Shutdown failed:', getSafeErrorDetails(error));
        process.exitCode = 1;
      }
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  await listening;
  server.removeListener?.('error', rejectListening);
  app.locals.readiness.announce();

  try {
    await initializeConfiguredModels({ embeddingService: app.locals.embeddingService });
    app.locals.readiness.transitionTo('ready');
  } catch (error) {
    app.locals.readiness.transitionTo('failed');
    console.error(
      '[INFERENCE] Model initialization failed:',
      getSafeStartupErrorDetails(error)
    );
    try {
      await closeServer(server);
    } catch (closeError) {
      console.error('[INFERENCE] Startup listener close failed:', getSafeErrorDetails(closeError));
    }
    throw error;
  }

  return server;
};

export const isInferenceEntryPoint = ({
  argv = process.argv,
  environment = process.env,
  moduleUrl = import.meta.url
} = {}) => Boolean(
  environment.pm_id !== undefined ||
  (argv[1] && moduleUrl === pathToFileURL(argv[1]).href)
);

if (isInferenceEntryPoint()) {
  try {
    await startServer();
  } catch (error) {
    console.error('[INFERENCE] Startup failed:', getSafeStartupErrorDetails(error));
    process.exitCode = 1;
  }
}
