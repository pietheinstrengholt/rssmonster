'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'contentStrippedHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE articles
      SET contentStrippedHash = SHA2(COALESCE(contentStripped, ''), 256)
      WHERE contentStrippedHash IS NULL
    `);

    await queryInterface.changeColumn('articles', 'contentStrippedHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('articles', 'contentStrippedHash');
  }
};
