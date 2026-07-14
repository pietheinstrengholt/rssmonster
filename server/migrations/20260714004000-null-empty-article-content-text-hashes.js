'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Allow textless articles to omit visible-text identity and clear legacy empty hashes.
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('articles', 'contentTextHash', {
      type: Sequelize.STRING(64),
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE articles
      SET contentTextHash = NULL
      WHERE contentTextHash = SHA2('', 256)
    `);
  },

  // Restore the former empty-string fingerprint and non-null column contract.
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE articles
      SET contentTextHash = SHA2('', 256)
      WHERE contentTextHash IS NULL
    `);

    await queryInterface.changeColumn('articles', 'contentTextHash', {
      type: Sequelize.STRING(64),
      allowNull: false
    });
  }
};
