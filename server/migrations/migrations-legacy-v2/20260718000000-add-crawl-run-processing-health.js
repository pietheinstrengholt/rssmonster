'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('crawl_runs', 'processedFeeds', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('crawl_runs', 'failedFeeds', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('crawl_runs', 'timedOutFeeds', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('crawl_runs', 'triggerType', {
      type: Sequelize.ENUM('scheduled', 'api'),
      allowNull: true,
      defaultValue: null
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('crawl_runs', 'triggerType');
    await queryInterface.removeColumn('crawl_runs', 'timedOutFeeds');
    await queryInterface.removeColumn('crawl_runs', 'failedFeeds');
    await queryInterface.removeColumn('crawl_runs', 'processedFeeds');
  }
};
