'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'feeds',
      {
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
          }
        },
        categoryId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'categories',
            key: 'id'
          }
        },
        feedName: {
          type: Sequelize.STRING,
          allowNull: false
        },
        feedDesc: {
          type: Sequelize.TEXT
        },
        feedType: {
          type: Sequelize.STRING(16),
          allowNull: true
        },
        url: {
          type: Sequelize.STRING,
          allowNull: false
        },
        favicon: {
          type: Sequelize.STRING
        },
        errorCount: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        errorMessage: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        errorSince: {
          type: Sequelize.DATE,
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('active', 'error', 'disabled'),
          allowNull: false,
          defaultValue: 'active'
        },
        feedTrust: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0.5
        },
        feedDuplicationRate: {
          type: Sequelize.FLOAT,
          allowNull: false,
          defaultValue: 0
        },
        lastFetched: {
          type: Sequelize.DATE,
          allowNull: true
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      }
    );

    // Indexes
    await queryInterface.addIndex('feeds', ['userId'], {
      name: 'feeds_userId_idx'
    });

    await queryInterface.addIndex('feeds', ['categoryId'], {
      name: 'feeds_categoryId_idx'
    });

    await queryInterface.addIndex('feeds', ['userId', 'url'], {
      name: 'feeds_userId_url_unique',
      unique: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('feeds', 'feeds_userId_idx');
    await queryInterface.removeIndex('feeds', 'feeds_categoryId_idx');
    await queryInterface.removeIndex('feeds', 'feeds_userId_url_unique');

    await queryInterface.dropTable('feeds');

    // Important: explicitly drop ENUM type (Postgres)
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_feeds_status";'
    );
  }
};
