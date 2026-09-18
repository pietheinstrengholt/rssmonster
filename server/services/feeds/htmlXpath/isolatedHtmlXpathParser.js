import { getCrawlOverrides } from '../../../config/crawlSettings.js';
import { Worker } from 'node:worker_threads';
import {
  createFeedTimeoutError,
  remainingDeadlineMs,
  resolveDeadlineAt,
  throwIfExecutionExpired
} from '../executionDeadline.js';
import {
  configuredPositiveInteger,
  DEFAULT_FEED_PARSER_MEMORY_MB,
  DEFAULT_FEED_PARSER_TIMEOUT_MS
} from '../feedsmith/isolatedFeedParser.js';

const DEFAULT_WORKER_URL = new URL('./parseHtmlXpathWorker.js', import.meta.url);

const workerResultError = value => {
  const error = new Error(value?.message || 'HTML/XPath parsing failed');
  error.name = value?.name || 'Error';
  if (value?.code) error.code = value.code;
  if (value?.field) error.field = value.field;
  if (value?.limit) error.limit = value.limit;
  return error;
};

// Parses untrusted HTML/XPath input inside the existing feed-parser resource envelope.
export const parseHtmlXpathIsolated = async (source, options = {}, {
  deadlineAt = null,
  signal = null,
  workerUrl = DEFAULT_WORKER_URL,
  parserTimeoutMs = configuredPositiveInteger('FEED_PARSER_TIMEOUT_MS', DEFAULT_FEED_PARSER_TIMEOUT_MS),
  parserMemoryMb = configuredPositiveInteger('FEED_PARSER_MEMORY_MB', DEFAULT_FEED_PARSER_MEMORY_MB)
} = {}) => {
  throwIfExecutionExpired({ signal, deadlineAt });
  const parserDeadlineAt = Math.min(resolveDeadlineAt(deadlineAt, parserTimeoutMs), Date.now() + parserTimeoutMs);
  const worker = new Worker(workerUrl, {
    workerData: { source: String(source || ''), options, crawlOverrides: getCrawlOverrides() },
    resourceLimits: {
      maxOldGenerationSizeMb: parserMemoryMb,
      maxYoungGenerationSizeMb: Math.max(4, Math.floor(parserMemoryMb / 4)),
      stackSizeMb: 4
    }
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutError = createFeedTimeoutError('HTML/XPath parser CPU deadline expired');
    const settle = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortWorker);
      worker.removeAllListeners();
      await worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(result);
    };
    const abortWorker = () => void settle(
      signal?.reason instanceof Error ? signal.reason : timeoutError
    );
    const timeoutId = setTimeout(
      () => void settle(timeoutError),
      Math.max(1, remainingDeadlineMs(parserDeadlineAt))
    );

    worker.once('message', message => {
      void settle(message.error ? workerResultError(message.error) : null, message.result);
    });
    worker.once('error', error => void settle(error));
    worker.once('exit', code => {
      if (!settled && code !== 0) void settle(new Error(`HTML/XPath parser worker exited with code ${code}`));
    });
    signal?.addEventListener('abort', abortWorker, { once: true });
    if (signal?.aborted) abortWorker();
  });
};

export default { parseHtmlXpathIsolated };
