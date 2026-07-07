'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.createTable('settings', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: Sequelize.INTEGER,
      unique: true,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    categoryId: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: '%'
    },
    feedId: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: '%'
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'unread'
    },
    sort: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'DESC'
    },
    minAdvertisementScore: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    minSentimentScore: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    minQualityScore: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    viewMode: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'full'
    },
    grouping: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'none'
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
  }),

  down: (queryInterface) => queryInterface.dropTable('settings')
};
