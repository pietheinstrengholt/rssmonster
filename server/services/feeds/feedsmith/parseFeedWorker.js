// Runs one synchronous Feedsmith parse inside a disposable worker isolate.

import { parentPort, workerData } from 'node:worker_threads';
import { parseFeedSourceSync } from './parseFeedSync.js';

// Serializes worker errors without exposing worker-specific instances.
const serializeError = error => ({
  name: error?.name || 'Error',
  code: error?.code || null,
  message: error?.message || 'Feed parsing failed',
  field: error?.field || null,
  limit: error?.limit || null
});

try {
  parentPort.postMessage({
    parsedFeed: parseFeedSourceSync(workerData.source, { feedUrl: workerData.feedUrl })
  });
} catch (error) {
  parentPort.postMessage({ error: serializeError(error) });
}
