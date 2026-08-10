'use strict';

module.exports = {
  // Creates this canonical RSSMonster 2.1 schema group.
  async up(queryInterface) {
    await queryInterface.sequelize.query("CREATE TABLE `categories` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `categoryOrder` int DEFAULT '0',\n  `iconName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `categories_id_userId_unique` (`id`,`userId`),\n  KEY `categories_userId_order_name_idx` (`userId`,`categoryOrder`,`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `feeds` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `categoryId` int NOT NULL,\n  `feedName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `feedDesc` text COLLATE utf8mb4_unicode_ci,\n  `feedType` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `favicon` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `errorCount` int DEFAULT '0',\n  `errorMessage` text COLLATE utf8mb4_unicode_ci,\n  `errorSince` datetime DEFAULT NULL,\n  `mutedUntil` datetime DEFAULT NULL,\n  `status` enum('active','error','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',\n  `feedTrust` float NOT NULL DEFAULT '0.5',\n  `feedDuplicationRate` float NOT NULL DEFAULT '0',\n  `feedAttentionAvg` float NOT NULL DEFAULT '0',\n  `feedDeepReadRatio` float NOT NULL DEFAULT '0',\n  `feedSkimRatio` float NOT NULL DEFAULT '0',\n  `feedIgnoreRatio` float NOT NULL DEFAULT '0',\n  `feedClickAvg` float NOT NULL DEFAULT '0',\n  `feedClickRatio` float NOT NULL DEFAULT '0',\n  `feedAttentionSampleSize` int NOT NULL DEFAULT '0',\n  `feedAttentionUpdatedAt` datetime DEFAULT NULL,\n  `crawlSince` datetime DEFAULT NULL,\n  `lastFetched` datetime DEFAULT NULL,\n  `applyAiAnalysis` tinyint(1) NOT NULL DEFAULT '1',\n  `generateEmbeddings` tinyint(1) NOT NULL DEFAULT '1',\n  `feedTags` json NOT NULL,\n  `updateIntervalMinutes` int DEFAULT NULL,\n  `etag` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `lastModified` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `contentHash` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `cacheFreshUntil` datetime DEFAULT NULL,\n  `lastAttemptAt` datetime DEFAULT NULL,\n  `lastSuccessAt` datetime DEFAULT NULL,\n  `lastChangedAt` datetime DEFAULT NULL,\n  `lastPublishedAt` datetime DEFAULT NULL,\n  `observedEntryIntervalMs` bigint DEFAULT NULL,\n  `consecutiveFailures` int NOT NULL DEFAULT '0',\n  `nextFetchAt` datetime DEFAULT CURRENT_TIMESTAMP,\n  `lastFetchOutcome` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `leaseUntil` datetime DEFAULT NULL,\n  `leaseOwner` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `publisherSelfUrl` text COLLATE utf8mb4_unicode_ci,\n  `publisherSelfStatus` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `publisherSelfCheckedAt` datetime DEFAULT NULL,\n  `publisherSelfDiagnostic` text COLLATE utf8mb4_unicode_ci,\n  `lastCrawlAt` datetime DEFAULT NULL,\n  `lastCrawlStatus` enum('SUCCESS','RECOVERED','FAILED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `lastCrawlErrorCategory` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `lastCrawlDurationMs` int DEFAULT NULL,\n  `lastSuccessfulCrawlAt` datetime DEFAULT NULL,\n  `totalCrawlFailures` int NOT NULL DEFAULT '0',\n  `totalCrawlSuccesses` int NOT NULL DEFAULT '0',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `feeds_id_userId_unique` (`id`,`userId`),\n  UNIQUE KEY `feeds_userId_url_unique` (`userId`,`url`),\n  KEY `feeds_userId_idx` (`userId`),\n  KEY `feeds_userId_feedName_idx` (`userId`,`feedName`),\n  KEY `feeds_categoryId_idx` (`categoryId`),\n  KEY `feeds_userId_categoryId_idx` (`userId`,`categoryId`),\n  KEY `feeds_categoryId_userId_fkey` (`categoryId`,`userId`),\n  KEY `feeds_due_claim_idx` (`status`,`nextFetchAt`,`leaseUntil`,`id`),\n  KEY `feeds_user_due_claim_idx` (`userId`,`status`,`nextFetchAt`,`leaseUntil`,`id`),\n  KEY `feeds_lease_owner_idx` (`leaseOwner`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `feed_url_aliases` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `feedId` int NOT NULL,\n  `originalUrl` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `normalizedUrl` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `normalizedUrlHash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `aliasType` enum('input','discovered_alternate','redirect','final','publisher_self','manual','historical') COLLATE utf8mb4_unicode_ci NOT NULL,\n  `firstSeenAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `lastSeenAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `feed_url_aliases_user_hash_unique` (`userId`,`normalizedUrlHash`),\n  KEY `feed_url_aliases_user_feed_idx` (`userId`,`feedId`),\n  KEY `feed_url_aliases_feed_idx` (`feedId`),\n  KEY `feed_url_aliases_user_type_idx` (`userId`,`aliasType`),\n  KEY `feed_url_aliases_feedId_userId_fkey` (`feedId`,`userId`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `official_sources` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `entity` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `domain` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `enabled` tinyint(1) NOT NULL DEFAULT '1',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `official_sources_userId_domain_unique` (`userId`,`domain`),\n  KEY `official_sources_userId_idx` (`userId`),\n  KEY `official_sources_userId_entity_idx` (`userId`,`entity`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.addConstraint("categories", {
      fields: ["userId"],
      type: 'foreign key',
      name: "categories_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feed_url_aliases", {
      fields: ["feedId","userId"],
      type: 'foreign key',
      name: "feed_url_aliases_feedId_userId_fkey",
      references: { table: "feeds", fields: ["id","userId"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feed_url_aliases", {
      fields: ["userId"],
      type: 'foreign key',
      name: "feed_url_aliases_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feed_url_aliases", {
      fields: ["feedId"],
      type: 'foreign key',
      name: "feed_url_aliases_ibfk_2",
      references: { table: "feeds", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feeds", {
      fields: ["categoryId","userId"],
      type: 'foreign key',
      name: "feeds_categoryId_userId_fkey",
      references: { table: "categories", fields: ["id","userId"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feeds", {
      fields: ["userId"],
      type: 'foreign key',
      name: "feeds_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("feeds", {
      fields: ["categoryId"],
      type: 'foreign key',
      name: "feeds_ibfk_2",
      references: { table: "categories", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("official_sources", {
      fields: ["userId"],
      type: 'foreign key',
      name: "official_sources_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
  },

  // Drops this baseline group in reverse dependency order.
  async down(queryInterface) {
    await queryInterface.dropTable("official_sources");
    await queryInterface.dropTable("feed_url_aliases");
    await queryInterface.dropTable("feeds");
    await queryInterface.dropTable("categories");
  }
};


