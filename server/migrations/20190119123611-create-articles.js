'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('articles', {
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
      feedId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'feeds',
          key: 'id'
        }
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'unread'
      },
      starInd: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      negativeInd: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clickedAmount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      openedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      hotInd: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      hotlinks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      media: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      url: {
        type: Sequelize.TEXT('medium'),
        allowNull: false
      },
      imageUrl: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      title: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      author: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      contentOriginal: {
        type: Sequelize.TEXT('medium'),
        allowNull: true
      },
      contentStripped: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      contentSummaryBullets: {
        type: Sequelize.JSON,
        allowNull: true
      },
      contentHash: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      vector: {
        type: Sequelize.JSON,
        allowNull: true
      },
      embedding_model: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      clusterId: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      language: {
        type: Sequelize.TEXT('tiny'),
        allowNull: true
      },
      advertisementScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 70
      },
      sentimentScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 70
      },
      qualityScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 70
      },
      attentionBucket: {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0
      },
      published: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      firstSeen: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW
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
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

    // ------------------------------------
    // Indexes
    // ------------------------------------
    await queryInterface.addIndex('articles', ['feedId'], {
      name: 'articles_feedId_idx'
    });

    await queryInterface.addIndex('articles', ['userId'], {
      name: 'articles_userId_idx'
    });

    await queryInterface.addIndex('articles', ['status'], {
      name: 'articles_status_idx'
    });

    await queryInterface.addIndex('articles', ['starInd'], {
      name: 'articles_starInd_idx'
    });

    await queryInterface.addIndex('articles', ['clickedAmount'], {
      name: 'articles_clickedAmount_idx'
    });

    await queryInterface.addIndex('articles', ['contentHash'], {
      name: 'articles_contentHash_idx'
    });

    await queryInterface.addIndex('articles', ['clusterId'], {
      name: 'articles_clusterId_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_feedId_idx');
    await queryInterface.removeIndex('articles', 'articles_status_idx');
    await queryInterface.removeIndex('articles', 'articles_starInd_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_idx');
    await queryInterface.removeIndex('articles', 'articles_clickedAmount_idx');
    await queryInterface.removeIndex('articles', 'articles_contentHash_idx');
    await queryInterface.removeIndex('articles', 'articles_clusterId_idx');
    await queryInterface.dropTable('articles');
  }
};