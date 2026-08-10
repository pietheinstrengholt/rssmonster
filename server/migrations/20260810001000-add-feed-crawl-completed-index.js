'use strict';

module.exports = {
  // Adds the composite range index used by feed observability history queries.
  up: async queryInterface => {
    await queryInterface.addIndex('feed_crawl_results', ['feedId', 'completedAt'], {
      name: 'feed_crawl_results_feed_completed_idx'
    });
  },

  // Removes the feed completion-time index.
  down: async queryInterface => {
    await queryInterface.removeIndex(
      'feed_crawl_results',
      'feed_crawl_results_feed_completed_idx'
    );
  }
};
