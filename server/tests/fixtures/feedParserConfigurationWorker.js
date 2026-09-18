import { parentPort, workerData, resourceLimits } from 'node:worker_threads';
parentPort.postMessage({ parsedFeed: { memoryMb: resourceLimits.maxOldGenerationSizeMb, overrides: workerData.crawlOverrides } });
