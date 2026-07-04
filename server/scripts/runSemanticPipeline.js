/**
 * Crawl Pipeline CLI orchestrator
 *
 * Usage:
 *   npm run crawl
 *   or
 *   node scripts/runSemanticPipeline.js
 *
 * Pipeline phases:
 * 1) Crawl feeds + persist new articles
 * 2) Generate article vectors for touched users
 * 3) Assign touched articles into Events
 * 4) Assign Topics for touched Events
 * 5) Refresh article interest scores from existing Islands
 */

import dotenv from 'dotenv';
dotenv.config();

// ---- Runtime bootstrap ----
import db from '../models/index.js';
import crawlController from '../controllers/crawl.js';
import runPostCrawlSemanticPipeline from '../services/crawl/postCrawlSemanticPipeline.js';

const { sequelize } = db;

const run = async () => {
  try {
    console.log('[SEMANTIC] Incremental crawl pipeline started');

    // 1. Ensure DB connection
    await sequelize.authenticate();

    // 2. Crawl raw articles only
    console.log('\n[PHASE 1/5] Crawl feeds + persist raw articles');
    const result = await crawlController.performCrawl();

    console.log(`[PHASE 1/5] feeds=${result.total} processed=${result.processed} errors=${result.errors} timeouts=${result.timeouts}`);

    // 3. Run the incremental semantic hierarchy only for users touched by the crawl.
    console.log('\n[PHASE 2/5] Generate article vectors');
    console.log('[PHASE 3/5] Incremental Events');
    console.log('[PHASE 4/5] Incremental Topics for touched Events');
    console.log('[PHASE 5/5] Refresh Interest Scores from existing Islands');
    const semanticResult = await runPostCrawlSemanticPipeline(result);
    console.log(
      `[SEMANTIC] stage=completed users=${semanticResult.users} ` +
      `embedded=${semanticResult.embedded} skipped=${semanticResult.skipped}`
    );
    console.log('[SEMANTIC] Incremental crawl pipeline Finished');

    console.log('\n=== Crawl Pipeline Completed ===');
    console.log(`Total feeds: ${result.total}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Errors: ${result.errors}`);
    console.log(`Timeouts: ${result.timeouts}`);

    process.exit(0);
  } catch (err) {
    console.error('\n=== Crawl Pipeline Failed ===');
    console.error('Error during pipeline execution:', err);
    process.exit(1);
  }
};

await run();

