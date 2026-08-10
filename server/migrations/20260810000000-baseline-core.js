'use strict';

const { addBaselineConstraint, createBaselineTable } = require('../utils/baselineMigrationTable.cjs');

module.exports = {
  // Creates this canonical RSSMonster 2.1 schema group.
  async up(queryInterface) {
    await createBaselineTable(queryInterface, "CREATE TABLE `users` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `username` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `feverCredentialHash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `role` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',\n  `lastLogin` datetime NOT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `username` (`username`),\n  UNIQUE KEY `hash` (`feverCredentialHash`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await createBaselineTable(queryInterface, "CREATE TABLE `settings` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `categoryId` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '%',\n  `feedId` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '%',\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unread',\n  `sort` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'desc',\n  `minAdvertisementScore` int NOT NULL DEFAULT '0',\n  `minSentimentScore` int NOT NULL DEFAULT '0',\n  `minQualityScore` int NOT NULL DEFAULT '0',\n  `viewMode` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full',\n  `grouping` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',\n  `includeDevelopingEvents` tinyint(1) NOT NULL DEFAULT '0',\n  `prioritizeHighTrust` tinyint(1) NOT NULL DEFAULT '0',\n  `themeMode` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',\n  `startupViewMode` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'last-used',\n  `markAsReadOnScroll` tinyint(1) NOT NULL DEFAULT '1',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `userId` (`userId`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await createBaselineTable(queryInterface, "CREATE TABLE `briefing_preferences` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `includeOnlyUnreadArticles` tinyint(1) NOT NULL DEFAULT '0',\n  `markAsReadOnScroll` tinyint(1) NOT NULL DEFAULT '0',\n  `includeDevelopingEvents` tinyint(1) NOT NULL DEFAULT '0',\n  `showOnlyInterestMatchedArticles` tinyint(1) NOT NULL DEFAULT '0',\n  `showOnlyDevelopingEventArticles` tinyint(1) NOT NULL DEFAULT '0',\n  `minDistinctSources` tinyint NOT NULL DEFAULT '1',\n  `prioritizeHighTrust` tinyint(1) NOT NULL DEFAULT '0',\n  `selectionPeriod` enum('24h','7d') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '7d',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `briefing_preferences_userId_unique` (`userId`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await createBaselineTable(queryInterface, "CREATE TABLE `smart_folders` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `query` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `limitCount` int NOT NULL DEFAULT '50',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `smart_folders_userId_idx` (`userId`),\n  KEY `smart_folders_userId_name_idx` (`userId`,`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await createBaselineTable(queryInterface, "CREATE TABLE `actions` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `actionType` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `regularExpression` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tagValue` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `actions_userId_idx` (`userId`),\n  KEY `actions_actionType_idx` (`actionType`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await addBaselineConstraint(queryInterface, "actions", {
      fields: ["userId"],
      type: 'foreign key',
      name: "actions_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "briefing_preferences", {
      fields: ["userId"],
      type: 'foreign key',
      name: "briefing_preferences_userId_fkey",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "settings", {
      fields: ["userId"],
      type: 'foreign key',
      name: "settings_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "smart_folders", {
      fields: ["userId"],
      type: 'foreign key',
      name: "smart_folders_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
  },

  // Drops this baseline group in reverse dependency order.
  async down(queryInterface) {
    await queryInterface.dropTable("actions");
    await queryInterface.dropTable("smart_folders");
    await queryInterface.dropTable("briefing_preferences");
    await queryInterface.dropTable("settings");
    await queryInterface.dropTable("users");
  }
};

