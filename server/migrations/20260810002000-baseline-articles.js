'use strict';

const { addBaselineConstraint, createBaselineTable } = require('../utils/baselineMigrationTable.cjs');

module.exports = {
  // Creates this canonical RSSMonster 2.1 schema group.
  async up(queryInterface) {
    await createBaselineTable(queryInterface, "CREATE TABLE `articles` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `externalId` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `externalIdType` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `userId` int NOT NULL,\n  `feedId` int NOT NULL,\n  `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unread',\n  `filteredInd` tinyint(1) NOT NULL DEFAULT '0',\n  `favoriteInd` int NOT NULL DEFAULT '0',\n  `negativeInd` int NOT NULL DEFAULT '0',\n  `positiveInd` int NOT NULL DEFAULT '0',\n  `clickedAmount` int NOT NULL DEFAULT '0',\n  `hotInd` int NOT NULL DEFAULT '0',\n  `hotlinks` int NOT NULL DEFAULT '0',\n  `media` json DEFAULT NULL,\n  `url` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `imageUrl` text COLLATE utf8mb4_unicode_ci,\n  `imageWidth` int unsigned DEFAULT NULL,\n  `imageHeight` int unsigned DEFAULT NULL,\n  `imageMimeType` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `imageSource` enum('media-content','media-thumbnail','enclosure','cleaned-content','content','description','publisher') COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `title` text COLLATE utf8mb4_unicode_ci NOT NULL,\n  `author` text COLLATE utf8mb4_unicode_ci,\n  `description` mediumtext COLLATE utf8mb4_unicode_ci,\n  `descriptionHtml` mediumtext COLLATE utf8mb4_unicode_ci,\n  `descriptionText` mediumtext COLLATE utf8mb4_unicode_ci,\n  `contentOriginal` mediumtext COLLATE utf8mb4_unicode_ci,\n  `contentHtml` mediumtext COLLATE utf8mb4_unicode_ci,\n  `contentText` mediumtext COLLATE utf8mb4_unicode_ci,\n  `contentSummaryBullets` json DEFAULT NULL,\n  `contentSourceHash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `isOfficialSource` tinyint(1) NOT NULL DEFAULT '0',\n  `officialOrganization` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `embedding_model` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `articleVector` json DEFAULT NULL,\n  `eventId` int DEFAULT NULL,\n  `topicId` int DEFAULT NULL,\n  `language` tinytext COLLATE utf8mb4_unicode_ci,\n  `advertisementScore` int NOT NULL DEFAULT '0',\n  `sentimentScore` int NOT NULL DEFAULT '50',\n  `qualityScore` int NOT NULL DEFAULT '50',\n  `interestScore` float NOT NULL DEFAULT '0',\n  `attentionBucket` tinyint NOT NULL DEFAULT '0',\n  `publishedAt` datetime NOT NULL,\n  `modifiedAt` datetime DEFAULT NULL,\n  `publishedSource` datetime DEFAULT NULL,\n  `publishInferred` tinyint(1) NOT NULL DEFAULT '0',\n  `firstSeen` datetime DEFAULT NULL,\n  `readAt` datetime DEFAULT NULL,\n  `urlHash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `duplicateOfArticleId` int DEFAULT NULL,\n  `duplicateCount` int NOT NULL DEFAULT '0',\n  `normalizedUrl` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `normalizedUrlHash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `contentTextHash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `articles_feedId_normalizedUrlHash_unique` (`feedId`,`normalizedUrlHash`),\n  UNIQUE KEY `articles_feedId_urlHash_unique` (`feedId`,`urlHash`),\n  KEY `articles_feedId_idx` (`feedId`),\n  KEY `articles_userId_idx` (`userId`),\n  KEY `articles_userId_published_idx` (`userId`,`publishedAt`),\n  KEY `articles_status_idx` (`status`),\n  KEY `articles_clickedAmount_idx` (`clickedAmount`),\n  KEY `articles_eventId_idx` (`eventId`),\n  KEY `articles_topicId_idx` (`topicId`),\n  KEY `articles_userId_eventId_published_idx` (`userId`,`eventId`,`publishedAt`),\n  KEY `articles_userId_topicId_published_idx` (`userId`,`topicId`,`publishedAt`),\n  KEY `articles_userId_status_published_idx` (`userId`,`status`,`publishedAt`),\n  KEY `articles_userId_feedId_status_published_idx` (`userId`,`feedId`,`status`,`publishedAt`),\n  KEY `articles_userId_feedId_published_idx` (`userId`,`feedId`,`publishedAt`),\n  KEY `articles_userId_status_feedId_published_idx` (`userId`,`status`,`feedId`,`publishedAt`),\n  KEY `articles_userId_feedId_status_advertisementScore_idx` (`userId`,`feedId`,`status`,`advertisementScore`),\n  KEY `articles_userId_feedId_status_sentimentScore_idx` (`userId`,`feedId`,`status`,`sentimentScore`),\n  KEY `articles_userId_feedId_status_qualityScore_idx` (`userId`,`feedId`,`status`,`qualityScore`),\n  KEY `articles_feedId_userId_fkey` (`feedId`,`userId`),\n  KEY `articles_user_feed_urlhash_crawl_idx` (`userId`,`feedId`,`urlHash`),\n  KEY `articles_user_feed_url_crawl_idx` (`userId`,`feedId`,`url`(255)),\n  KEY `articles_user_feed_title_crawl_idx` (`userId`,`feedId`,`title`(255)),\n  KEY `articles_favoriteInd_idx` (`favoriteInd`),\n  KEY `articles_userId_favoriteInd_published_idx` (`userId`,`favoriteInd`,`publishedAt`),\n  KEY `articles_duplicateOfArticleId_idx` (`duplicateOfArticleId`),\n  KEY `articles_userId_duplicateOfArticleId_published_idx` (`userId`,`duplicateOfArticleId`,`publishedAt`),\n  KEY `articles_userId_isOfficialSource_published_idx` (`userId`,`isOfficialSource`,`publishedAt`),\n  KEY `articles_contentSourceHash_idx` (`contentSourceHash`),\n  KEY `articles_userId_contentTextHash_idx` (`userId`,`contentTextHash`),\n  KEY `articles_userId_contentSourceHash_idx` (`userId`,`contentSourceHash`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await createBaselineTable(queryInterface, "CREATE TABLE `tags` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `articleId` int NOT NULL,\n  `userId` int NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `tagType` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `tags_articleId_name_unique` (`articleId`,`name`),\n  KEY `tags_userId_name_idx` (`userId`,`name`),\n  KEY `tags_name_idx` (`name`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await createBaselineTable(queryInterface, "CREATE TABLE `hotlinks` (\n  `userId` int NOT NULL,\n  `feedId` int NOT NULL,\n  `sourceArticleId` int DEFAULT NULL,\n  `url` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,\n  `createdAt` datetime DEFAULT NULL,\n  KEY `hotlinks_userId_url_idx` (`userId`,`url`(255)),\n  KEY `hotlinks_feedId_idx` (`feedId`),\n  KEY `hotlinks_userId_feedId_url_idx` (`userId`,`feedId`,`url`(255)),\n  KEY `hotlinks_sourceArticleId_idx` (`sourceArticleId`),\n  KEY `hotlinks_userId_createdAt_idx` (`userId`,`createdAt`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await addBaselineConstraint(queryInterface, "articles", {
      fields: ["duplicateOfArticleId"],
      type: 'foreign key',
      name: "articles_duplicateOfArticleId_foreign_idx",
      references: { table: "articles", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
    await addBaselineConstraint(queryInterface, "articles", {
      fields: ["feedId","userId"],
      type: 'foreign key',
      name: "articles_feedId_userId_fkey",
      references: { table: "feeds", fields: ["id","userId"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "articles", {
      fields: ["userId"],
      type: 'foreign key',
      name: "articles_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "articles", {
      fields: ["feedId"],
      type: 'foreign key',
      name: "articles_ibfk_2",
      references: { table: "feeds", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "hotlinks", {
      fields: ["userId"],
      type: 'foreign key',
      name: "hotlinks_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "hotlinks", {
      fields: ["feedId"],
      type: 'foreign key',
      name: "hotlinks_ibfk_2",
      references: { table: "feeds", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "hotlinks", {
      fields: ["sourceArticleId"],
      type: 'foreign key',
      name: "hotlinks_sourceArticleId_foreign_idx",
      references: { table: "articles", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "tags", {
      fields: ["articleId"],
      type: 'foreign key',
      name: "tags_ibfk_1",
      references: { table: "articles", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await addBaselineConstraint(queryInterface, "tags", {
      fields: ["userId"],
      type: 'foreign key',
      name: "tags_ibfk_2",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
  },

  // Drops this baseline group in reverse dependency order.
  async down(queryInterface) {
    await queryInterface.dropTable("hotlinks");
    await queryInterface.dropTable("tags");
    await queryInterface.dropTable("articles");
  }
};

