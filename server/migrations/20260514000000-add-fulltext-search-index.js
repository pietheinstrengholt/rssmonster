'use strict';

module.exports = {
  up: async (queryInterface) => {
    // Add FULLTEXT index on article search columns
    await queryInterface.sequelize.query(`
      CREATE FULLTEXT INDEX ft_articles_search 
      ON articles (title, description, contentOriginal)
    `);
  },

  down: async (queryInterface) => {
    // Drop FULLTEXT index
    await queryInterface.sequelize.query(`
      DROP INDEX ft_articles_search ON articles
    `);
  }
};
