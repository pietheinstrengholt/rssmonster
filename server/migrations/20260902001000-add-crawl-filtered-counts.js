'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('crawl_runs', 'articlesFiltered', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feed_crawl_results', 'articlesFiltered', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('feed_crawl_results', 'articlesFiltered');
    await queryInterface.removeColumn('crawl_runs', 'articlesFiltered');
  }
};
