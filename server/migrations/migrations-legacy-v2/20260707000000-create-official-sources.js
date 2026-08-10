'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('official_sources', {
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
      entity: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      domain: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.addIndex('official_sources', ['userId'], {
      name: 'official_sources_userId_idx'
    });
    await queryInterface.addIndex('official_sources', ['userId', 'entity'], {
      name: 'official_sources_userId_entity_idx'
    });
    await queryInterface.addIndex('official_sources', ['userId', 'domain'], {
      name: 'official_sources_userId_domain_unique',
      unique: true
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('official_sources');
  }
};
