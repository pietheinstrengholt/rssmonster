'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('article_clusters', {
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

      // Representative article for this EVENT
      representativeArticleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'articles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      // Human-readable event name
      name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      // Event size
      articleCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },

      // Confidence this cluster represents a real event
      clusterStrength: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0
      },

      /**
       * Topic signature
       * Same value = same STORY/TOPIC, but different events
       */
      topicKey: {
        type: Sequelize.CHAR(40),
        allowNull: true
      },
      eventVector: {
        type: Sequelize.JSON,
        allowNull: true
      },
      topicVector: {
        type: Sequelize.JSON,
        allowNull: true
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

    await queryInterface.addIndex(
      'article_clusters',
      ['representativeArticleId'],
      { name: 'article_clusters_rep_article_idx' }
    );

    await queryInterface.addIndex(
      'article_clusters',
      ['topicKey'],
      { name: 'article_clusters_topic_idx' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('article_clusters');
  }
};