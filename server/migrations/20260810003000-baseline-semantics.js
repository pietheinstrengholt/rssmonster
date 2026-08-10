'use strict';

module.exports = {
  // Creates this canonical RSSMonster 2.1 schema group.
  async up(queryInterface) {
    await queryInterface.sequelize.query("CREATE TABLE `topics` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `topicKey` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `topicVector` json DEFAULT NULL,\n  `topicType` enum('event','behavioral','hybrid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'event',\n  `affinityScore` float DEFAULT '0',\n  `evidenceScore` float DEFAULT '0',\n  `articleCount` int DEFAULT '0',\n  `behavioralArticleCount` int DEFAULT '0',\n  `eventCount` int DEFAULT '0',\n  `starredCount` int DEFAULT '0',\n  `lastActivityAt` datetime DEFAULT NULL,\n  `lastBehaviorAt` datetime DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `topics_userId_idx` (`userId`),\n  KEY `topics_userId_topicType_idx` (`userId`,`topicType`),\n  KEY `topics_topicKey_idx` (`topicKey`),\n  KEY `topics_affinityScore_idx` (`affinityScore`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `events` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `userId` int NOT NULL,\n  `topicId` int DEFAULT NULL,\n  `representativeArticleId` int NOT NULL,\n  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `articleCount` int DEFAULT '1',\n  `sourceCount` int DEFAULT '0',\n  `sourceDiversityScore` float DEFAULT '0',\n  `eventStrength` float DEFAULT '0',\n  `eventVector` json DEFAULT NULL,\n  `eventWindowStartAt` datetime DEFAULT NULL,\n  `eventWindowEndAt` datetime DEFAULT NULL,\n  `status` enum('emerging','active','cooling','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'emerging',\n  `developingArticleId` int DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `representativeArticleId` (`representativeArticleId`),\n  KEY `events_userId_idx` (`userId`),\n  KEY `events_topicId_idx` (`topicId`),\n  KEY `events_status_idx` (`status`),\n  KEY `events_userId_updatedAt_idx` (`userId`,`updatedAt`),\n  KEY `events_userId_topicId_eventStrength_idx` (`userId`,`topicId`,`eventStrength`),\n  KEY `events_developingArticleId_fkey` (`developingArticleId`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `article_topics` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `articleId` int NOT NULL,\n  `topicId` int NOT NULL,\n  `confidence` float NOT NULL DEFAULT '0',\n  `rank` int NOT NULL DEFAULT '1',\n  `primaryInd` tinyint(1) NOT NULL DEFAULT '0',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `article_topics_article_topic_unique` (`articleId`,`topicId`),\n  KEY `article_topics_topic_idx` (`topicId`),\n  KEY `article_topics_primary_idx` (`articleId`,`primaryInd`),\n  KEY `article_topics_rank_idx` (`articleId`,`rank`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `event_topics` (\n  `id` int NOT NULL AUTO_INCREMENT,\n  `eventId` int NOT NULL,\n  `topicId` int NOT NULL,\n  `confidence` float NOT NULL DEFAULT '0',\n  `rank` int NOT NULL DEFAULT '1',\n  `primaryInd` tinyint(1) NOT NULL DEFAULT '0',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `event_topics_event_topic_unique` (`eventId`,`topicId`),\n  KEY `event_topics_topic_idx` (`topicId`),\n  KEY `event_topics_primary_idx` (`eventId`,`primaryInd`),\n  KEY `event_topics_rank_idx` (`eventId`,`rank`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `islands` (\n  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `weight` float NOT NULL DEFAULT '0',\n  `userId` int NOT NULL,\n  `islandVector` json DEFAULT NULL,\n  `archivedInd` tinyint(1) NOT NULL DEFAULT '0',\n  `archivedAt` datetime DEFAULT NULL,\n  `positiveSignals` json NOT NULL,\n  `populationAudit` json DEFAULT NULL,\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  KEY `islands_userId_idx` (`userId`),\n  KEY `islands_user_weight_idx` (`userId`,`weight`),\n  KEY `islands_user_archived_idx` (`userId`,`archivedInd`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `island_topics` (\n  `islandId` bigint unsigned NOT NULL,\n  `topicId` int NOT NULL,\n  `similarity` float NOT NULL DEFAULT '0',\n  `confidence` float NOT NULL DEFAULT '0',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`islandId`,`topicId`),\n  KEY `island_topics_topic_idx` (`topicId`),\n  KEY `island_topics_confidence_idx` (`islandId`,`confidence`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.sequelize.query("CREATE TABLE `island_taxonomy` (\n  `id` bigint unsigned NOT NULL AUTO_INCREMENT,\n  `identity` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `displayName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `categoryName` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,\n  `description` text COLLATE utf8mb4_unicode_ci,\n  `vector` json DEFAULT NULL,\n  `embedding_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\n  `status` enum('active','hidden','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',\n  `createdAt` datetime NOT NULL,\n  `updatedAt` datetime NOT NULL,\n  PRIMARY KEY (`id`),\n  UNIQUE KEY `identity` (`identity`),\n  UNIQUE KEY `island_taxonomy_identity_unique` (`identity`),\n  KEY `island_taxonomy_category_idx` (`categoryName`),\n  KEY `island_taxonomy_status_idx` (`status`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    await queryInterface.addConstraint("article_topics", {
      fields: ["articleId"],
      type: 'foreign key',
      name: "article_topics_ibfk_1",
      references: { table: "articles", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("article_topics", {
      fields: ["topicId"],
      type: 'foreign key',
      name: "article_topics_ibfk_2",
      references: { table: "topics", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("articles", {
      fields: ["eventId"],
      type: 'foreign key',
      name: "articles_eventId_fkey",
      references: { table: "events", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
    await queryInterface.addConstraint("articles", {
      fields: ["topicId"],
      type: 'foreign key',
      name: "articles_ibfk_3",
      references: { table: "topics", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
    await queryInterface.addConstraint("event_topics", {
      fields: ["eventId"],
      type: 'foreign key',
      name: "event_topics_ibfk_1",
      references: { table: "events", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("event_topics", {
      fields: ["topicId"],
      type: 'foreign key',
      name: "event_topics_ibfk_2",
      references: { table: "topics", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("events", {
      fields: ["developingArticleId"],
      type: 'foreign key',
      name: "events_developingArticleId_fkey",
      references: { table: "articles", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
    await queryInterface.addConstraint("events", {
      fields: ["userId"],
      type: 'foreign key',
      name: "events_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("events", {
      fields: ["topicId"],
      type: 'foreign key',
      name: "events_ibfk_2",
      references: { table: "topics", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
    await queryInterface.addConstraint("events", {
      fields: ["representativeArticleId"],
      type: 'foreign key',
      name: "events_ibfk_3",
      references: { table: "articles", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("island_topics", {
      fields: ["islandId"],
      type: 'foreign key',
      name: "island_topics_ibfk_1",
      references: { table: "islands", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("island_topics", {
      fields: ["topicId"],
      type: 'foreign key',
      name: "island_topics_ibfk_2",
      references: { table: "topics", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("islands", {
      fields: ["userId"],
      type: 'foreign key',
      name: "islands_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
    await queryInterface.addConstraint("topics", {
      fields: ["userId"],
      type: 'foreign key',
      name: "topics_ibfk_1",
      references: { table: "users", fields: ["id"] },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
  },

  // Drops this baseline group in reverse dependency order.
  async down(queryInterface) {
    await queryInterface.removeConstraint('articles', 'articles_eventId_fkey');
    await queryInterface.removeConstraint('articles', 'articles_ibfk_3');
    await queryInterface.dropTable("island_taxonomy");
    await queryInterface.dropTable("island_topics");
    await queryInterface.dropTable("islands");
    await queryInterface.dropTable("event_topics");
    await queryInterface.dropTable("article_topics");
    await queryInterface.dropTable("events");
    await queryInterface.dropTable("topics");
  }
};
