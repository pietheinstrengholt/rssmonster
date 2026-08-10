'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('crawl_runs', 'articleErrors', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('crawl_runs', 'errors', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('crawl_runs', 'durationMs', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('crawl_runs', 'durationMs');
    await queryInterface.removeColumn('crawl_runs', 'errors');
    await queryInterface.removeColumn('crawl_runs', 'articleErrors');
  }
};
