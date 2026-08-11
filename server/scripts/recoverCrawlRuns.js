// Explicit maintenance command for recovering stale or administratively abandoned crawls.

import dotenv from 'dotenv';
dotenv.config();

import db from '../models/index.js';
import {
  STALE_CRAWL_ERROR_MESSAGE,
  failStaleCrawlRuns
} from '../services/crawl/crawlRunHeartbeat.js';

const { CrawlRun, sequelize } = db;
export const MANUAL_CRAWL_RESET_ERROR_MESSAGE =
  'Crawl was manually reset by an administrator.';

export const recoverCrawlRuns = async ({ all = false, now = new Date() } = {}) => {
  if (!all) return failStaleCrawlRuns({ now });

  return CrawlRun.update({
    status: 'failed',
    completedAt: now,
    errorMessage: MANUAL_CRAWL_RESET_ERROR_MESSAGE
  }, {
    where: { status: 'running' }
  });
};

const isEntryPoint = process.argv[1]?.endsWith('recoverCrawlRuns.js');
if (isEntryPoint) {
  const all = process.argv.includes('--all');
  try {
    await sequelize.authenticate();
    const [updatedCount] = await recoverCrawlRuns({ all });
    console.log(
      `[CrawlRecovery] Marked ${updatedCount} ${all ? 'running' : 'stale'} ` +
      `crawl run(s) as failed.`
    );
    if (!all) {
      console.log(`[CrawlRecovery] Stale reason: ${STALE_CRAWL_ERROR_MESSAGE}`);
    }
  } catch (error) {
    console.error('[CrawlRecovery] Failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

export default recoverCrawlRuns;
