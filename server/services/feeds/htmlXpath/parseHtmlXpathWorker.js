import { withCrawlConfiguration } from '../../../config/crawlSettings.js';
import { parentPort, workerData } from 'node:worker_threads';
import { parseHtmlXpath } from './parseHtmlXpath.js';

const serializeError = error => ({
  name: error?.name || 'Error',
  code: error?.code || null,
  message: error?.message || 'HTML/XPath parsing failed',
  field: error?.field || null,
  limit: error?.limit || null
});

try {
  parentPort.postMessage({ result: withCrawlConfiguration(workerData.crawlOverrides, () => parseHtmlXpath(workerData.source, workerData.options)) });
} catch (error) {
  parentPort.postMessage({ error: serializeError(error) });
}
