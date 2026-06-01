'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('topics', {
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
      topicKey: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      topicVector: {
        type: Sequelize.JSON,
        allowNull: true
      },
      topicType: {
        type: Sequelize.ENUM('event', 'behavioral', 'hybrid'),
        allowNull: false,
        defaultValue: 'event'
      },
      affinityScore: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      evidenceScore: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },
      articleCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      behavioralArticleCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      eventCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      starredCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      lastActivityAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      lastBehaviorAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('topics', ['userId'], {
      name: 'topics_userId_idx'
    });
    await queryInterface.addIndex('topics', ['userId', 'topicType'], {
      name: 'topics_userId_topicType_idx'
    });
    await queryInterface.addIndex('topics', ['topicKey'], {
      name: 'topics_topicKey_idx'
    });
    await queryInterface.addIndex('topics', ['affinityScore'], {
      name: 'topics_affinityScore_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('topics');
  }
};
