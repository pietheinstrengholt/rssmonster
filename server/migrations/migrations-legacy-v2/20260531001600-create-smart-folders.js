'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('smartFolders', {
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
        type: Sequelize.STRING(255),
        allowNull: false
      },
      query: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      limitCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50
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

    await queryInterface.addIndex('smartFolders', ['userId'], {
      name: 'smartFolders_userId_idx'
    });
    await queryInterface.addIndex('smartFolders', ['userId', 'name'], {
      name: 'smartFolders_userId_name_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('smartFolders');
  }
};
