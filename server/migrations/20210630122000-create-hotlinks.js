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

    // Primary performance index for hotlink rebuilds
    await queryInterface.addIndex('hotlinks', ['userId', 'url'], {
      name: 'hotlinks_userId_url_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('hotlinks', 'hotlinks_userId_url_idx');
    await queryInterface.dropTable('hotlinks');
  }
};
