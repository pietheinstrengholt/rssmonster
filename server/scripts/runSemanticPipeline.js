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

const { User, sequelize } = db;

const parsedUserBatchSize = Number.parseInt(process.env.CRAWL_USER_BATCH_SIZE, 10);
const DEFAULT_USER_BATCH_SIZE = Number.isInteger(parsedUserBatchSize) && parsedUserBatchSize > 0
  ? parsedUserBatchSize
  : 5;

// This function combines per-user crawl results for the existing semantic pipeline.
function aggregateCrawlResults(results) {
  const crawlStartedAt = results
    .map(result => result.crawlStartedAt)
    .filter(Boolean)
    .reduce((earliest, value) => {
      const timestamp = new Date(value);
      return !earliest || timestamp < earliest ? timestamp : earliest;
    }, null);

  return {
    total: results.reduce((sum, result) => sum + (result.total || 0), 0),
    processed: results.reduce((sum, result) => sum + (result.processed || 0), 0),
    errors: results.reduce((sum, result) => sum + (result.errors || 0), 0),
    timeouts: results.reduce((sum, result) => sum + (result.timeouts || 0), 0),
    crawlTimedOut: results.some(result => result.crawlTimedOut),
    processedUserIds: [
      ...new Set(results.flatMap(result => result.processedUserIds || []))
    ],
    crawlStartedAt,
    totalNewArticles: results.reduce(
      (sum, result) => sum + (result.totalNewArticles || 0),
      0
    ),
    totalUpdatedArticles: results.reduce(
      (sum, result) => sum + (result.totalUpdatedArticles || 0),
      0
    ),
    skippedCrawls: results.filter(
      result => result.reason === 'crawl_already_running'
    ).length
  };
}

// This function crawls every user through the normal per-user lifecycle in bounded batches.
async function crawlUsersInBatches(users, userBatchSize) {
  const results = [];

  for (let offset = 0; offset < users.length; offset += userBatchSize) {
    const userBatch = users.slice(offset, offset + userBatchSize);
    const batchResults = await Promise.all(
      userBatch.map(user => crawlController.performCrawl(user.id))
    );
    results.push(...batchResults);
  }

  return results;
}

// This function runs the incremental crawl pipeline for every user.
export async function runSemanticPipeline({
  userBatchSize = DEFAULT_USER_BATCH_SIZE
} = {}) {
  const resolvedBatchSize = Number.isInteger(userBatchSize) && userBatchSize > 0
    ? userBatchSize
    : DEFAULT_USER_BATCH_SIZE;

  console.log('[SEMANTIC] Incremental crawl pipeline started');

  await sequelize.authenticate();

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']],
    raw: true
  });

  console.log('\n[PHASE 1/5] Crawl feeds + persist raw articles');
  console.log(`[PHASE 1/5] users=${users.length} userBatchSize=${resolvedBatchSize}`);

  const userResults = await crawlUsersInBatches(users, resolvedBatchSize);
  const result = aggregateCrawlResults(userResults);

  console.log(
    `[PHASE 1/5] feeds=${result.total} processed=${result.processed} ` +
    `errors=${result.errors} timeouts=${result.timeouts} ` +
    `alreadyRunning=${result.skippedCrawls}`
  );

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

  return {
    crawl: result,
    semantic: semanticResult
  };
}

export default runSemanticPipeline;

if (process.argv[1]?.includes('runSemanticPipeline')) {
  runSemanticPipeline()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n=== Crawl Pipeline Failed ===');
      console.error('Error during pipeline execution:', err);
      process.exit(1);
    });
}
