'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Helper to check if index exists
    const indexExists = async (table, indexName) => {
      const indexes = await queryInterface.showIndex(table);
      return indexes.some(idx => idx.name === indexName);
    };

    // (userId, feedId, status, published) — Feed-specific queries
    if (!await indexExists('articles', 'articles_userId_feedId_status_published_idx')) {
      await queryInterface.addIndex('articles', ['userId', 'feedId', 'status', 'published'], {
        name: 'articles_userId_feedId_status_published_idx'
      });
    }

    // (userId, starInd, published) — Starred articles (used by importance vector load)
    if (!await indexExists('articles', 'articles_userId_starInd_published_idx')) {
      await queryInterface.addIndex('articles', ['userId', 'starInd', 'published'], {
        name: 'articles_userId_starInd_published_idx'
      });
    }

    // (userId, topicKey, clusterStrength) — TopicGroup aggregations on article_clusters
    if (!await indexExists('article_clusters', 'article_clusters_userId_topicKey_clusterStrength_idx')) {
      await queryInterface.addIndex('article_clusters', ['userId', 'topicKey', 'clusterStrength'], {
        name: 'article_clusters_userId_topicKey_clusterStrength_idx'
      });
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_userId_feedId_status_published_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_starInd_published_idx');
    await queryInterface.removeIndex('article_clusters', 'article_clusters_userId_topicKey_clusterStrength_idx');
  }
};
