'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'hotlinks',
      {
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          }
        },
        url: {
          type: Sequelize.TEXT('medium'),
          allowNull: false
        },
        createdAt: {
          type: Sequelize.DATE
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      }
    );

    // ------------------------------------
    // Indexes
    // ------------------------------------

    // Sequelize cannot reliably create TEXT prefix indexes on MySQL.
    // Use raw SQL to ensure url prefix length is applied.
    await queryInterface.sequelize.query(`
      CREATE INDEX hotlinks_userId_url_idx
      ON hotlinks (userId, url(255));
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX hotlinks_userId_url_idx ON hotlinks;
    `);

    await queryInterface.dropTable('hotlinks');
  }
};