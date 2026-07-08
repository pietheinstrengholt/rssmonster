'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'normalizedUrl', {
      type: Sequelize.STRING(1024),
      allowNull: true
    });

    await queryInterface.addColumn('articles', 'normalizedUrlHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE articles
      SET
        normalizedUrl = url,
        normalizedUrlHash = SHA2(url, 256)
      WHERE normalizedUrl IS NULL
        OR normalizedUrlHash IS NULL
    `);

    await queryInterface.changeColumn('articles', 'normalizedUrl', {
      type: Sequelize.STRING(1024),
      allowNull: false
    });

    await queryInterface.changeColumn('articles', 'normalizedUrlHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });

    await queryInterface.addIndex('articles', ['feedId', 'normalizedUrlHash'], {
      unique: true,
      name: 'articles_feedId_normalizedUrlHash_unique'
    });
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('articles', 'articles_feedId_normalizedUrlHash_unique');
    await queryInterface.removeColumn('articles', 'normalizedUrlHash');
    await queryInterface.removeColumn('articles', 'normalizedUrl');
  }
};
