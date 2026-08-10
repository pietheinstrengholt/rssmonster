'use strict';

module.exports = {
  // Creates this canonical RSSMonster 2.1 schema group.
  async up(queryInterface) {
    await queryInterface.sequelize.query("CREATE TABLE `crawl_runs` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `status` enum('running','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running',\n  `startedAt` datetime NOT NULL,\n  `completedAt` datetime DEFAULT NULL,\n  `errorMessage` text COLLATE utf8mb4_unicode_ci,\n  `newArticles` int DEFAULT NULL,\n  `updatedArticles` int DEFAULT NULL,\n  `articleErrors` int DEFAULT NULL,\n  `errors` int DEFAULT NULL,\n  `durationMs` int DEFAULT NULL,\n  `processedFeeds` int DEFAULT NULL,\n  `failedFeeds` int DEFAULT NULL,\n  `timedOutFeeds` int DEFAULT NULL,\n  `triggerType` enum('scheduled','api') COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `feedsAttempted` int DEFAULT NULL,\n  `feedsSucceeded` int DEFAULT NULL,\n  `feedsRecovered` int DEFAULT NULL,\n  `articlesFetched` int DEFAULT NULL,\n  `articlesUnchanged` int DEFAULT NULL,\n  `articlesDuplicate` int DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `crawl_runs_active_user_unique` (((case when (`status` = _utf8mb4'running') then `userId` else NULL end))),\n  KEY `crawl_runs_userId_idx` (`userId`),\n  KEY `crawl_runs_userId_startedAt_idx` (`userId`,`startedAt`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `feed_crawl_results` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `crawlRunId` int NOT NULL,\n  `userId` int NOT NULL,\n  `feedId` int NOT NULL,\n  `status` enum('SUCCESS','RECOVERED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL,\n  `errorCategory` enum('TIMEOUT','NOT_FOUND','RATE_LIMITED','HTTP_ERROR','REDIRECT_LOOP','NETWORK_ERROR','INVALID_FEED','MALFORMED_BODY','VALIDATION_ERROR','EMPTY_FEED','SECURITY_REJECTED','TOO_LARGE','UNKNOWN_ERROR') COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `errorCode` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `httpStatus` int DEFAULT NULL,\n  `requestedUrl` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `resolvedUrl` text COLLATE utf8mb4_unicode_ci,\n  `recoveryAttempted` tinyint(1) NOT NULL DEFAULT '0',\n  `recoverySucceeded` tinyint(1) NOT NULL DEFAULT '0',\n  `attemptCount` int NOT NULL DEFAULT '1',\n  `itemsFetched` int NOT NULL DEFAULT '0',\n  `articlesNew` int NOT NULL DEFAULT '0',\n  `articlesUpdated` int NOT NULL DEFAULT '0',\n  `articlesUnchanged` int NOT NULL DEFAULT '0',\n  `articlesDuplicate` int NOT NULL DEFAULT '0',\n  `durationMs` int NOT NULL DEFAULT '0',\n  `errorMessage` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `attemptSummary` json DEFAULT NULL,\n  `startedAt` datetime NOT NULL,\n  `completedAt` datetime NOT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `feed_crawl_results_run_feed_idx` (`crawlRunId`,`feedId`),\n  KEY `feed_crawl_results_feed_created_idx` (`feedId`,`createdAt`),\n  KEY `feed_crawl_results_user_created_idx` (`userId`,`createdAt`),\n  KEY `feed_crawl_results_run_status_idx` (`crawlRunId`,`status`),\n  KEY `feed_crawl_results_category_created_idx` (`errorCategory`,`createdAt`),\n  KEY `feed_crawl_results_feed_completed_idx` (`feedId`,`completedAt`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.addConstraint("crawl_runs", {
      fields: ["userId"],
      type: 'foreign key',
      name: "crawl_runs_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feed_crawl_results", {
      fields: ["crawlRunId"],
      type: 'foreign key',
      name: "feed_crawl_results_ibfk_1",
      references: { table: "crawl_runs", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feed_crawl_results", {
      fields: ["userId"],
      type: 'foreign key',
      name: "feed_crawl_results_ibfk_2",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feed_crawl_results", {
      fields: ["feedId"],
      type: 'foreign key',
      name: "feed_crawl_results_ibfk_3",
      references: { table: "feeds", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
  },

  // Drops this baseline group in reverse dependency order.
  async down(queryInterface) {
    await queryInterface.dropTable("feed_crawl_results");
    await queryInterface.dropTable("crawl_runs");
  }
};

