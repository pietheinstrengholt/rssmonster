'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if table already exists
    const tableExists = await queryInterface.tableExists('user_stats');
    if (tableExists) {
      console.log('user_stats table already exists, skipping creation');
      return;
    }

    // Create user_stats table for materialized count cache
    await queryInterface.createTable('user_stats', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      totalCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      unreadCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      readCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      starCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      hotCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clickedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Index on userId for fast lookups
    await queryInterface.addIndex('user_stats', ['userId'], {
      name: 'user_stats_userId_idx'
    });
  },

  down: async (queryInterface) => {
    // Drop table
    await queryInterface.dropTable('user_stats');
  }
};
