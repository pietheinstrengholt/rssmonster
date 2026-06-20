'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'urlHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE articles
      SET urlHash = SHA2(url, 256)
      WHERE urlHash IS NULL
    `);

    await queryInterface.changeColumn('articles', 'urlHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });

    await queryInterface.addIndex('articles', ['feedId', 'urlHash'], {
      unique: true,
      name: 'articles_feedId_urlHash_unique'
    });
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('articles', 'articles_feedId_urlHash_unique');
    await queryInterface.removeColumn('articles', 'urlHash');
  }
};
