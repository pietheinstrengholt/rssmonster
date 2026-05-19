'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('article_topics', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      articleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'articles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      topicId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'topics',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      rank: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      primaryInd: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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

    await queryInterface.addIndex('article_topics', ['articleId', 'topicId'], {
      unique: true,
      name: 'article_topics_article_topic_unique'
    });

    await queryInterface.addIndex('article_topics', ['topicId'], {
      name: 'article_topics_topic_idx'
    });

    await queryInterface.addIndex('article_topics', ['articleId', 'primaryInd'], {
      name: 'article_topics_primary_idx'
    });

    await queryInterface.addIndex('article_topics', ['articleId', 'rank'], {
      name: 'article_topics_rank_idx'
    });

    await queryInterface.createTable('event_topics', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'events',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      topicId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'topics',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      rank: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      primaryInd: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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

    await queryInterface.addIndex('event_topics', ['eventId', 'topicId'], {
      unique: true,
      name: 'event_topics_event_topic_unique'
    });

    await queryInterface.addIndex('event_topics', ['topicId'], {
      name: 'event_topics_topic_idx'
    });

    await queryInterface.addIndex('event_topics', ['eventId', 'primaryInd'], {
      name: 'event_topics_primary_idx'
    });

    await queryInterface.addIndex('event_topics', ['eventId', 'rank'], {
      name: 'event_topics_rank_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('event_topics');
    await queryInterface.dropTable('article_topics');
  }
};
