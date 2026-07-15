'use strict';

module.exports = {
  // This migration adds an index for bounded per-user crawl statistics queries.
  async up(queryInterface) {
    await queryInterface.addIndex('crawl_runs', ['userId', 'startedAt'], {
      name: 'crawl_runs_userId_startedAt_idx'
    });
  },

  // This migration removes the per-user crawl statistics index.
  async down(queryInterface) {
    await queryInterface.removeIndex('crawl_runs', 'crawl_runs_userId_startedAt_idx');
  }
};
