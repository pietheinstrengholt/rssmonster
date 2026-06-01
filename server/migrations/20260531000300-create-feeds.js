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
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
        allowNull: true,
        defaultValue: null
      },
      errorSince: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      },
      mutedUntil: {
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
      feedAttentionAvg: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      feedDeepReadRatio: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      feedSkimRatio: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      feedIgnoreRatio: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      feedAttentionSampleSize: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      feedAttentionUpdatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      },
      crawlSince: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      },
      lastFetched: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
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

    await queryInterface.addIndex('feeds', ['userId'], {
      name: 'feeds_userId_idx'
    });
    await queryInterface.addIndex('feeds', ['userId', 'feedName'], {
      name: 'feeds_userId_feedName_idx'
    });
    await queryInterface.addIndex('feeds', ['categoryId'], {
      name: 'feeds_categoryId_idx'
    });
    await queryInterface.addIndex('feeds', ['userId', 'categoryId'], {
      name: 'feeds_userId_categoryId_idx'
    });
    await queryInterface.addIndex('feeds', ['id', 'userId'], {
      name: 'feeds_id_userId_unique',
      unique: true
    });
    await queryInterface.addIndex('feeds', ['userId', 'url'], {
      name: 'feeds_userId_url_unique',
      unique: true
    });
    await queryInterface.addConstraint('feeds', {
      fields: ['categoryId', 'userId'],
      type: 'foreign key',
      name: 'feeds_categoryId_userId_fkey',
      references: {
        table: 'categories',
        fields: ['id', 'userId']
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('feeds');
  }
};
