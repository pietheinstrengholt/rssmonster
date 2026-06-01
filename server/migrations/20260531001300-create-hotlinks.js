'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('hotlinks', {
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      feedId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'feeds',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      url: {
        type: Sequelize.TEXT('medium'),
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    await queryInterface.sequelize.query(`
      CREATE INDEX hotlinks_userId_url_idx
      ON hotlinks (userId, url(255));
    `);
    await queryInterface.addIndex('hotlinks', ['feedId'], {
      name: 'hotlinks_feedId_idx'
    });
    await queryInterface.sequelize.query(`
      CREATE INDEX hotlinks_userId_feedId_url_idx
      ON hotlinks (userId, feedId, url(255));
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('hotlinks');
  }
};
