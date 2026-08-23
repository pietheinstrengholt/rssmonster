import { checkCrawlWorkerHealth } from './crawlWorkerHealth.js';

try {
  const result = await checkCrawlWorkerHealth();
  if (!result.healthy) {
    console.error(`[CrawlWorkerHealth] Unhealthy: ${result.reason}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[CrawlWorkerHealth] Unavailable: ${error.message}`);
  process.exitCode = 1;
}
