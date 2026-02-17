'use strict';

module.exports = {
  up: async (queryInterface) => {
    // article_clusters: userId is used in every clustering query
    await queryInterface.addIndex(
      'article_clusters',
      ['userId', 'updatedAt'],
      { name: 'article_clusters_userId_updatedAt_idx' }
    );

    // articles: compound index for incremental clustering lookup
    // (userId, clusterId, published) covers the WHERE + ORDER BY
    await queryInterface.addIndex(
      'articles',
      ['userId', 'clusterId', 'published'],
      { name: 'articles_userId_clusterId_published_idx' }
    );

    // articles: compound index for status-based clustering queries
    await queryInterface.addIndex(
      'articles',
      ['userId', 'status', 'published'],
      { name: 'articles_userId_status_published_idx' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('article_clusters', 'article_clusters_userId_updatedAt_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_clusterId_published_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_status_published_idx');
  }
};
