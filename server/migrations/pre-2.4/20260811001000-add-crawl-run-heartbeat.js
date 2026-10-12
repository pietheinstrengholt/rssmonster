'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('crawl_runs', 'heartbeatAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('crawl_runs', 'ownerToken', {
      type: Sequelize.STRING(36),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addIndex('crawl_runs', ['status', 'heartbeatAt'], {
      name: 'crawl_runs_status_heartbeatAt_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('crawl_runs', 'crawl_runs_status_heartbeatAt_idx');
    await queryInterface.removeColumn('crawl_runs', 'ownerToken');
    await queryInterface.removeColumn('crawl_runs', 'heartbeatAt');
  }
};
