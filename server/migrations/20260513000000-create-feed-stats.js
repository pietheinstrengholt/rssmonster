'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('feedStats', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      feedId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'feeds',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        index: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      articleCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      unreadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastRefreshed: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    await queryInterface.addIndex('feedStats', ['userId', 'lastRefreshed']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('feedStats');
  }
};
