'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
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
      eventWindowStartAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      eventWindowEndAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('emerging', 'active', 'cooling', 'archived'),
        allowNull: false,
        defaultValue: 'emerging'
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

    await queryInterface.addIndex('events', ['userId'], {
      name: 'events_userId_idx'
    });
    await queryInterface.addIndex('events', ['topicId'], {
      name: 'events_topicId_idx'
    });
    await queryInterface.addIndex('events', ['status'], {
      name: 'events_status_idx'
    });
    await queryInterface.addIndex('events', ['userId', 'updatedAt'], {
      name: 'events_userId_updatedAt_idx'
    });
    await queryInterface.addIndex('events', ['userId', 'topicId', 'eventStrength'], {
      name: 'events_userId_topicId_eventStrength_idx'
    });

    await queryInterface.addConstraint('articles', {
      fields: ['eventId'],
      type: 'foreign key',
      name: 'articles_eventId_fkey',
      references: {
        table: 'events',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeConstraint('articles', 'articles_eventId_fkey');
    await queryInterface.dropTable('events');
  }
};
