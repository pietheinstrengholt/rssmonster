/**
 * Crawl Pipeline CLI orchestrator
 *
 * Usage:
 *   npm run crawl
 *   or
 *   node scripts/crawl.js
 *
 * Pipeline phases:
 * 1) Crawl feeds + persist new articles + generate article vectors
 * 2) Build and reconcile Events
 * 3) Build and reconcile Topics + Event/Topic relationships
 * 4) Rebuild Interest Islands
 */

import dotenv from 'dotenv';
dotenv.config();

// ---- Runtime bootstrap ----
import db from '../models/index.js';
import crawlController from '../controllers/crawl.js';
import { buildEvents } from './buildEvents.js';
import { buildTopics } from './buildTopics.js';
import buildInterestIslands from './buildInterestIslands.js';

const { sequelize } = db;

const run = async () => {
  try {
    console.log('Starting crawl pipeline...');

    // 1. Ensure DB connection
    await sequelize.authenticate();

    // 2. Crawl + embed article vectors
    console.log('\n[PHASE 1/4] Crawl feeds + embed article vectors');
    const result = await crawlController.performCrawl(null, { waitForEmbedding: true });

    console.log(`[PHASE 1/4] feeds=${result.total} processed=${result.processed} errors=${result.errors} timeouts=${result.timeouts}`);

    // 3. Build and reconcile events from article vectors
    console.log('\n[PHASE 2/4] Build and reconcile Events');
    await buildEvents({ mode: 'incremental' });
    console.log('[PHASE 2/4] Events done');

    // 4. Build and reconcile topics + event-topic links
    console.log('\n[PHASE 3/4] Build and reconcile Topics');
    await buildTopics({ assignmentContext: 'incremental' });
    console.log('[PHASE 3/4] Topics done');

    // 5. Rebuild user interest islands
    console.log('\n[PHASE 4/4] Rebuild Interest Islands');
    const islandResult = await buildInterestIslands();
    if (islandResult?.userCount != null) {
      console.log(`[PHASE 4/4] Islands processed users=${islandResult.userCount}`);
    }
    console.log('[PHASE 4/4] Interest Islands done');

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