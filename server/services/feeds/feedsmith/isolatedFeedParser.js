// Supervises disposable parser workers with CPU deadlines and heap constraints.

import { Worker } from 'node:worker_threads';
import {
  createFeedTimeoutError,
  remainingDeadlineMs,
  resolveDeadlineAt,
  throwIfExecutionExpired
} from '../executionDeadline.js';
import { assertSafeFeedSource } from './parseFeedSync.js';
import { prepareFeedSource } from './xmlCleanup.js';

export const DEFAULT_FEED_PARSER_TIMEOUT_MS = 2000;
export const DEFAULT_FEED_PARSER_MEMORY_MB = 64;

const DEFAULT_WORKER_URL = new URL('./parseFeedWorker.js', import.meta.url);

// Reads one positive parser resource setting.
const configuredPositiveInteger = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// Reconstructs a stable application error from worker-safe data.
const workerResultError = value => {
  const error = new Error(value?.message || 'Feed parsing failed');
  error.name = value?.name || 'Error';
  if (value?.code) error.code = value.code;
  if (value?.field) error.field = value.field;
  if (value?.limit) error.limit = value.limit;
  return error;
};

// Parses one feed in a worker that is terminated before timeout is reported.
export const parseFeedSourceIsolated = async (source, {
  deadlineAt,
  signal,
  feedUrl = null,
  workerUrl = DEFAULT_WORKER_URL,
  parserTimeoutMs = configuredPositiveInteger(
    'FEED_PARSER_TIMEOUT_MS',
    DEFAULT_FEED_PARSER_TIMEOUT_MS
  ),
  parserMemoryMb = configuredPositiveInteger(
    'FEED_PARSER_MEMORY_MB',
    DEFAULT_FEED_PARSER_MEMORY_MB
  )
} = {}) => {
  throwIfExecutionExpired({ signal, deadlineAt });
  const safeSource = assertSafeFeedSource(prepareFeedSource(source));
  const overallDeadlineAt = resolveDeadlineAt(deadlineAt, parserTimeoutMs);
  const parserDeadlineAt = Math.min(
    overallDeadlineAt,
    Date.now() + parserTimeoutMs
  );
  const worker = new Worker(workerUrl, {
    workerData: { source: safeSource, feedUrl },
    resourceLimits: {
      maxOldGenerationSizeMb: parserMemoryMb,
      maxYoungGenerationSizeMb: Math.max(4, Math.floor(parserMemoryMb / 4)),
      stackSizeMb: 4
    }
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutError = createFeedTimeoutError('Feed parser CPU deadline expired');

    // Removes listeners and terminates the worker before settling the caller.
    const settle = async (error, parsedFeed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortWorker);
      worker.removeAllListeners();
      await worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(parsedFeed);
    };

    // Terminates worker CPU activity when the parent execution is aborted.
    const abortWorker = () => {
      const error = signal?.reason instanceof Error
        ? signal.reason
        : timeoutError;
      void settle(error);
    };

    const timeoutId = setTimeout(
      () => void settle(timeoutError),
      Math.max(1, remainingDeadlineMs(parserDeadlineAt))
    );
    worker.once('message', result => {
      void settle(
        result.error ? workerResultError(result.error) : null,
        result.parsedFeed
      );
    });
    worker.once('error', error => void settle(error));
    worker.once('exit', code => {
      if (!settled && code !== 0) {
        void settle(new Error(`Feed parser worker exited with code ${code}`));
      }
    });
    signal?.addEventListener('abort', abortWorker, { once: true });
    if (signal?.aborted) abortWorker();
  });
};

export default { parseFeedSourceIsolated };
