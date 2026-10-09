// Internal Electron utility process only; the renderer still uses the existing REST API.
let server;
let worker;
let stopping = false;
process.parentPort.on('message', async ({ data }) => {
  if (data !== 'stop' || stopping) return;
  stopping = true;
  try {
    await worker?.shutdown('Desktop closing');
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});

try {
  if (process.argv[2] === 'inference') {
    const { startServer } = await import('../inference/src/index.js');
    await startServer({ host: '127.0.0.1', port: 0, onListening: listener => {
      server = listener;
      process.parentPort.postMessage({ type: 'listening', url: `http://127.0.0.1:${server.address().port}` });
    } });
    process.parentPort.postMessage({ type: 'ready' });
  } else if (process.argv[2] === 'ai-worker') {
    const { default: db } = await import('../server/models/index.js');
    const { configureDesktopDatabase } = await import('./database.js');
    configureDesktopDatabase(db);
    const { createAiWorker } = await import('../server/src/workers/aiWorker.js');
    const { createAiWorkerHealthReporter } = await import('../server/src/workers/aiWorkerHealth.js');
    worker = createAiWorker({ registerProcessHandlers: false, healthReporter: createAiWorkerHealthReporter() });
    const running = worker.start();
    process.parentPort.postMessage({ type: 'listening' });
    await running;
    process.exit(process.exitCode || 0);
  } else if (process.argv[2] === 'crawl-worker') {
    const { startDesktopCrawlWorker } = await import('./crawl-process.js');
    worker = await startDesktopCrawlWorker(process.parentPort, JSON.parse(process.env.RSSMONSTER_DESKTOP_CRAWL_SETTINGS));
    const running = worker.start();
    process.parentPort.postMessage({ type: 'listening' });
    await running;
    if (!stopping && !process.exitCode) process.parentPort.postMessage({ type: 'finished' });
    process.exit(process.exitCode || 0);
  } else throw new Error('Unknown desktop service');
} catch (error) {
  console.error('Desktop service failed:', error);
  process.exit(1);
}
