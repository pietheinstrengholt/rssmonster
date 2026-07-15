'use strict';

const ACTIVE_CRAWL_INDEX = 'crawl_runs_active_user_unique';

module.exports = {
  up: async queryInterface => {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX ${ACTIVE_CRAWL_INDEX}
      ON crawl_runs ((CASE WHEN status = 'running' THEN userId ELSE NULL END))
    `);
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('crawl_runs', ACTIVE_CRAWL_INDEX);
  }
};
