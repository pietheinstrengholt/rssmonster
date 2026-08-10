'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('island_topics', {
      islandId: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'islands',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      topicId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'topics',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      similarity: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('island_topics', ['topicId'], {
      name: 'island_topics_topic_idx'
    });
    await queryInterface.addIndex('island_topics', ['islandId', 'confidence'], {
      name: 'island_topics_confidence_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('island_topics');
  }
};
