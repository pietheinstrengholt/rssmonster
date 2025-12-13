'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('actions', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
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
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      actionType: {
        type: Sequelize.STRING,
        allowNull: false
      },
      regularExpression: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Index for fast lookups by user
    await queryInterface.addIndex('actions', ['userId'], {
      name: 'actions_userId_idx',
      unique: false
    });

    // Index for filtering by action type
    await queryInterface.addIndex('actions', ['actionType'], {
      name: 'actions_actionType_idx',
      unique: false
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('actions', 'actions_userId_idx');
    await queryInterface.removeIndex('actions', 'actions_actionType_idx');
    await queryInterface.dropTable('actions');
  }
};
