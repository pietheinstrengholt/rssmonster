'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('crawl_runs', 'newArticles', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addColumn('crawl_runs', 'updatedArticles', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('crawl_runs', 'updatedArticles');
    await queryInterface.removeColumn('crawl_runs', 'newArticles');
  }
};
