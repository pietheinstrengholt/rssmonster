'use strict';

module.exports = {
  // This migration creates the per-user Daily Briefing preference store.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('briefing_preferences', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      includeOnlyUnreadArticles: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      includeDevelopingEvents: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      minDistinctSources: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 1
      },
      prioritizeHighTrust: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      selectionPeriod: {
        type: Sequelize.ENUM('24h', '7d'),
        allowNull: false,
        defaultValue: '7d'
      },
      mutedInterestIslands: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: Sequelize.literal('(JSON_ARRAY())')
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    await queryInterface.addIndex('briefing_preferences', ['userId'], {
      name: 'briefing_preferences_userId_unique',
      unique: true
    });

    await queryInterface.addConstraint('briefing_preferences', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'briefing_preferences_userId_fkey',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  // This migration removes the Daily Briefing preference store.
  down: async (queryInterface) => {
    await queryInterface.dropTable('briefing_preferences');
  }
};
