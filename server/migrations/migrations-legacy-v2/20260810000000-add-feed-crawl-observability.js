'use strict';

module.exports = {
  // Adds durable per-feed outcomes, feed health cache fields, and run aggregates.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('feed_crawl_results', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
      crawlRunId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'crawl_runs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      feedId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'feeds', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      status: { type: Sequelize.ENUM('SUCCESS', 'RECOVERED', 'FAILED'), allowNull: false },
      errorCategory: { type: Sequelize.ENUM('TIMEOUT', 'NOT_FOUND', 'RATE_LIMITED', 'HTTP_ERROR', 'REDIRECT_LOOP', 'NETWORK_ERROR', 'INVALID_FEED', 'MALFORMED_BODY', 'VALIDATION_ERROR', 'EMPTY_FEED', 'SECURITY_REJECTED', 'TOO_LARGE', 'UNKNOWN_ERROR'), allowNull: true },
      errorCode: { type: Sequelize.STRING(128), allowNull: true }, httpStatus: { type: Sequelize.INTEGER, allowNull: true },
      requestedUrl: { type: Sequelize.TEXT, allowNull: false }, resolvedUrl: { type: Sequelize.TEXT, allowNull: true },
      recoveryAttempted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, recoverySucceeded: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      attemptCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 }, itemsFetched: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      articlesNew: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, articlesUpdated: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, articlesUnchanged: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, articlesDuplicate: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      durationMs: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, errorMessage: { type: Sequelize.STRING(1000), allowNull: true }, attemptSummary: { type: Sequelize.JSON, allowNull: true },
      startedAt: { type: Sequelize.DATE, allowNull: false }, completedAt: { type: Sequelize.DATE, allowNull: false }, createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }, updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    }, { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' });
    await queryInterface.addIndex('feed_crawl_results', ['crawlRunId', 'feedId'], { name: 'feed_crawl_results_run_feed_idx' });
    await queryInterface.addIndex('feed_crawl_results', ['feedId', 'createdAt'], { name: 'feed_crawl_results_feed_created_idx' });
    await queryInterface.addIndex('feed_crawl_results', ['userId', 'createdAt'], { name: 'feed_crawl_results_user_created_idx' });
    await queryInterface.addIndex('feed_crawl_results', ['crawlRunId', 'status'], { name: 'feed_crawl_results_run_status_idx' });
    await queryInterface.addIndex('feed_crawl_results', ['errorCategory', 'createdAt'], { name: 'feed_crawl_results_category_created_idx' });
    const feedColumns = { lastCrawlAt: Sequelize.DATE, lastCrawlStatus: Sequelize.ENUM('SUCCESS', 'RECOVERED', 'FAILED'), lastCrawlErrorCategory: Sequelize.STRING(32), lastCrawlDurationMs: Sequelize.INTEGER, lastSuccessfulCrawlAt: Sequelize.DATE, totalCrawlFailures: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }, totalCrawlSuccesses: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 } };
    for (const [name, definition] of Object.entries(feedColumns)) await queryInterface.addColumn('feeds', name, definition);
    const runColumns = ['feedsAttempted', 'feedsSucceeded', 'feedsRecovered', 'articlesFetched', 'articlesUnchanged', 'articlesDuplicate'];
    for (const name of runColumns) await queryInterface.addColumn('crawl_runs', name, { type: Sequelize.INTEGER, allowNull: true, defaultValue: null });
  },
  // Removes observability additions while preserving older crawl state.
  down: async (queryInterface) => {
    for (const name of ['articlesDuplicate', 'articlesUnchanged', 'articlesFetched', 'feedsRecovered', 'feedsSucceeded', 'feedsAttempted']) await queryInterface.removeColumn('crawl_runs', name);
    for (const name of ['totalCrawlSuccesses', 'totalCrawlFailures', 'lastSuccessfulCrawlAt', 'lastCrawlDurationMs', 'lastCrawlErrorCategory', 'lastCrawlStatus', 'lastCrawlAt']) await queryInterface.removeColumn('feeds', name);
    await queryInterface.dropTable('feed_crawl_results');
  }
};
