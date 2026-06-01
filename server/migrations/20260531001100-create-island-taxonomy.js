'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('island_taxonomy', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      identity: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      displayName: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      categoryName: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      vector: {
        type: Sequelize.JSON,
        allowNull: true
      },
      embedding_model: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'hidden', 'archived'),
        allowNull: false,
        defaultValue: 'active'
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

    await queryInterface.addIndex('island_taxonomy', ['identity'], {
      unique: true,
      name: 'island_taxonomy_identity_unique'
    });
    await queryInterface.addIndex('island_taxonomy', ['categoryName'], {
      name: 'island_taxonomy_category_idx'
    });
    await queryInterface.addIndex('island_taxonomy', ['status'], {
      name: 'island_taxonomy_status_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('island_taxonomy');
  }
};
