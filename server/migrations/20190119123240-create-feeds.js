'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('feeds', {
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
          // This is a reference to another model
          model: "users",

          // This is the column name of the referenced model
          key: "id"
        }
      },
      // It is possible to create foreign keys:
      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // This is a reference to another model
          model: "categories",

          // This is the column name of the referenced model
          key: "id"
        }
      },
      feedName: {
        type: Sequelize.STRING,
        allowNull: false
      },
      feedDesc: Sequelize.TEXT,
      feedType: {
        type: Sequelize.STRING(16),
        allowNull: true
      },
      url: {
        type: Sequelize.STRING
      },
      rssUrl: {
        type: Sequelize.STRING
      },
      favicon: Sequelize.STRING,
      errorCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      active: { 
        type: Sequelize.BOOLEAN, 
        allowNull: false, 
        defaultValue: true 
      },
      createdAt: {
        type: Sequelize.DATE
      },
      updatedAt: {
        type: Sequelize.DATE
      }
    },
    {
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci"
    });

    // Indexes for fast lookups
    await queryInterface.addIndex('feeds', ['userId'], { name: 'feeds_userId_idx' });
    await queryInterface.addIndex('feeds', ['categoryId'], { name: 'feeds_categoryId_idx' });
    await queryInterface.addIndex('feeds', ['userId', 'rssUrl'], { name: 'feeds_userId_rssUrl_unique', unique: true });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('feeds', 'feeds_userId_idx');
    await queryInterface.removeIndex('feeds', 'feeds_categoryId_idx');
    await queryInterface.removeIndex('feeds', 'feeds_userId_rssUrl_unique');
    await queryInterface.dropTable('feeds');
  }
};