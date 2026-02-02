/**
 * Crawl CLI runner
 *
 * Usage:
 *   npm run crawl
 *   or
 *   node scripts/crawl.js
 */

import dotenv from 'dotenv';
dotenv.config();

// ---- Runtime bootstrap ----
import db from '../models/index.js';
import crawlController from '../controllers/crawl.js';

const { sequelize } = db;

const run = async () => {
  try {
    console.log('Starting RSS feed crawl...');

    // 1. Ensure DB connection
    await sequelize.authenticate();

    // 2. Run crawl (wait for clustering to complete in CLI mode)
    const result = await crawlController.performCrawl(null, { waitForCluster: true });

    console.log('\n=== Crawl Completed ===');
    console.log(`Total feeds: ${result.total}`);
    console.log(`Successfully processed: ${result.processed}`);
    console.log(`Errors: ${result.errors}`);

    process.exit(0);
  } catch (err) {
    console.error('\n=== Crawl Failed ===');
    console.error('Error during crawl:', err);
    process.exit(1);
  }
};

await run();