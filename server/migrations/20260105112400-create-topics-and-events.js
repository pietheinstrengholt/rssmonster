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
        allowNull: false,
        defaultValue: 'Untitled Topic'
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

      affinityScore: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },

      articleCount: {
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
      'topics',
      ['userId'],
      { name: 'topics_userId_idx' }
    );

    await queryInterface.addIndex(
      'topics',
      ['topicKey'],
      { name: 'topics_topicKey_idx' }
    );

    await queryInterface.addIndex(
      'topics',
      ['affinityScore'],
      { name: 'topics_affinityScore_idx' }
    );

    await queryInterface.createTable('events', {
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

      name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      articleCount: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },

      sourceCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },

      sourceDiversityScore: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },

      eventStrength: {
        type: Sequelize.FLOAT,
        defaultValue: 0
      },

      eventVector: {
        type: Sequelize.JSON,
        allowNull: true
      },

      firstSeen: {
        type: Sequelize.DATE,
        allowNull: true
      },

      lastSeen: {
        type: Sequelize.DATE,
        allowNull: true
      },

      status: {
        type: Sequelize.ENUM('active', 'cooling', 'archived'),
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

    await queryInterface.addIndex(
      'events',
      ['userId'],
      { name: 'events_userId_idx' }
    );

    await queryInterface.addIndex(
      'events',
      ['topicId'],
      { name: 'events_topicId_idx' }
    );

    await queryInterface.addIndex(
      'events',
      ['status'],
      { name: 'events_status_idx' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('events');
    await queryInterface.dropTable('topics');
  }
};
