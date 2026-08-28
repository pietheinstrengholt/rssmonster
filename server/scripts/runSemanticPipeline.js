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
import {
  getSequelizeRuntimeCapabilities,
  resolveEffectiveSequelizeCrawlConfiguration
} from '../config/databaseRuntime.js';
import { runPostCrawlSemanticPipeline } from '../services/crawl/index.js';
import { withCrawlPriorityLease } from '../services/jobs/crawlPriorityLease.js';
import { formatCrawlCompletionLine } from '../services/feeds/crawlResult.js';

const { User, sequelize } = db;
const databaseRuntimeCapabilities = getSequelizeRuntimeCapabilities(sequelize);
const effectiveCrawlConfiguration =
  resolveEffectiveSequelizeCrawlConfiguration(sequelize);
const DEFAULT_USER_BATCH_SIZE = effectiveCrawlConfiguration.userBatchSize;

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
    failedFeeds: results.reduce((sum, result) => sum + (result.failedFeeds || 0), 0),
    timedOutFeeds: results.reduce(
      (sum, result) => sum + (result.timedOutFeeds || 0),
      0
    ),
    errors: results.reduce((sum, result) => sum + (result.errors || 0), 0),
    timeouts: results.reduce((sum, result) => sum + (result.timeouts || 0), 0),
    crawlTimedOut: results.some(result => result.crawlTimedOut),
    processedUserIds: [
      ...new Set(results.flatMap(result => result.processedUserIds || []))
    ],
    crawlRunIdsByUserId: Object.fromEntries(
      results
        .filter(result => result.userId && result.crawlRunId)
        .map(result => [result.userId, result.crawlRunId])
    ),
    executionIdsByUserId: Object.fromEntries(
      results
        .filter(result => result.userId && result.executionId)
        .map(result => [result.userId, result.executionId])
    ),
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
      userBatch.map(user => crawlController.performCrawl(user.id, {
        triggerType: 'scheduled'
      }))
    );
    results.push(...batchResults);
  }

  return results;
}

// This function runs the incremental crawl pipeline for every user.
async function runSemanticPipelineOperation({
  userBatchSize = DEFAULT_USER_BATCH_SIZE
} = {}) {
  const resolvedBatchSize = Number.isInteger(userBatchSize) && userBatchSize > 0
    ? Math.min(userBatchSize, databaseRuntimeCapabilities.maxConcurrentUserCrawls)
    : DEFAULT_USER_BATCH_SIZE;

  await sequelize.authenticate();

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']],
    raw: true
  });

  const userResults = await crawlUsersInBatches(users, resolvedBatchSize);
  const result = aggregateCrawlResults(userResults);
  const semanticResult = await runPostCrawlSemanticPipeline(result);

  for (const userResult of userResults) {
    if (userResult.reason === 'crawl_already_running') continue;
    console.log(formatCrawlCompletionLine({
      feeds: userResult.total,
      newArticles: userResult.totalNewArticles,
      errors: userResult.errors,
      userId: userResult.userId,
      durationMs: userResult.crawlStartedAt
        ? Date.now() - new Date(userResult.crawlStartedAt).getTime()
        : 0
    }));
  }

  return {
    crawl: result,
    semantic: semanticResult
  };
}

// Holds the cross-process priority gate for scheduled workers and direct CLI runs.
export const runSemanticPipeline = options => withCrawlPriorityLease(
  () => runSemanticPipelineOperation(options)
);

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
