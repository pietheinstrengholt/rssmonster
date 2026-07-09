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
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      feedId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'feeds',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
      positiveInd: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clickedAmount: {
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
        type: Sequelize.STRING(1024),
        allowNull: false
      },
      imageUrl: {
        type: Sequelize.STRING(1024),
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
      embedding_model: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      articleVector: {
        type: Sequelize.JSON,
        allowNull: true
      },
      eventId: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      topicId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'topics',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      language: {
        type: Sequelize.TEXT('tiny'),
        allowNull: true
      },
      advertisementScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      sentimentScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50
      },
      qualityScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50
      },
      interestScore: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('articles', ['feedId'], {
      name: 'articles_feedId_idx'
    });
    await queryInterface.addIndex('articles', ['userId'], {
      name: 'articles_userId_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'published'], {
      name: 'articles_userId_published_idx'
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
    await queryInterface.addIndex('articles', ['eventId'], {
      name: 'articles_eventId_idx'
    });
    await queryInterface.addIndex('articles', ['topicId'], {
      name: 'articles_topicId_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'eventId', 'published'], {
      name: 'articles_userId_eventId_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'topicId', 'published'], {
      name: 'articles_userId_topicId_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'status', 'published'], {
      name: 'articles_userId_status_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'feedId', 'status', 'published'], {
      name: 'articles_userId_feedId_status_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'feedId', 'published'], {
      name: 'articles_userId_feedId_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'starInd', 'published'], {
      name: 'articles_userId_starInd_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'status', 'feedId', 'published'], {
      name: 'articles_userId_status_feedId_published_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'feedId', 'status', 'advertisementScore'], {
      name: 'articles_userId_feedId_status_advertisementScore_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'feedId', 'status', 'sentimentScore'], {
      name: 'articles_userId_feedId_status_sentimentScore_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'feedId', 'status', 'qualityScore'], {
      name: 'articles_userId_feedId_status_qualityScore_idx'
    });
    await queryInterface.addConstraint('articles', {
      fields: ['feedId', 'userId'],
      type: 'foreign key',
      name: 'articles_feedId_userId_fkey',
      references: {
        table: 'feeds',
        fields: ['id', 'userId']
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('articles');
  }
};
