'use strict';

module.exports = {
  up: async (queryInterface) => {
    const indexExists = async (table, indexName) => {
      const indexes = await queryInterface.showIndex(table);
      return indexes.some(idx => idx.name === indexName);
    };

    // Main timeline lookups often filter by user/status/feed and sort by published.
    if (!await indexExists('articles', 'articles_userId_status_feedId_published_idx')) {
      await queryInterface.addIndex(
        'articles',
        ['userId', 'status', 'feedId', 'published'],
        { name: 'articles_userId_status_feedId_published_idx' }
      );
    }

    // Score-threshold filters are applied on every search; keep them scoped by user/feed/status.
    if (!await indexExists('articles', 'articles_userId_feedId_status_advertisementScore_idx')) {
      await queryInterface.addIndex(
        'articles',
        ['userId', 'feedId', 'status', 'advertisementScore'],
        { name: 'articles_userId_feedId_status_advertisementScore_idx' }
      );
    }

    if (!await indexExists('articles', 'articles_userId_feedId_status_sentimentScore_idx')) {
      await queryInterface.addIndex(
        'articles',
        ['userId', 'feedId', 'status', 'sentimentScore'],
        { name: 'articles_userId_feedId_status_sentimentScore_idx' }
      );
    }

    if (!await indexExists('articles', 'articles_userId_feedId_status_qualityScore_idx')) {
      await queryInterface.addIndex(
        'articles',
        ['userId', 'feedId', 'status', 'qualityScore'],
        { name: 'articles_userId_feedId_status_qualityScore_idx' }
      );
    }
  },

  down: async (queryInterface) => {
    const indexExists = async (table, indexName) => {
      const indexes = await queryInterface.showIndex(table);
      return indexes.some(idx => idx.name === indexName);
    };

    if (await indexExists('articles', 'articles_userId_feedId_status_qualityScore_idx')) {
      await queryInterface.removeIndex('articles', 'articles_userId_feedId_status_qualityScore_idx');
    }

    if (await indexExists('articles', 'articles_userId_feedId_status_sentimentScore_idx')) {
      await queryInterface.removeIndex('articles', 'articles_userId_feedId_status_sentimentScore_idx');
    }

    if (await indexExists('articles', 'articles_userId_feedId_status_advertisementScore_idx')) {
      await queryInterface.removeIndex('articles', 'articles_userId_feedId_status_advertisementScore_idx');
    }

    if (await indexExists('articles', 'articles_userId_status_feedId_published_idx')) {
      await queryInterface.removeIndex('articles', 'articles_userId_status_feedId_published_idx');
    }
  }
};
