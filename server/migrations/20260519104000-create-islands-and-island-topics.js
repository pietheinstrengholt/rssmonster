'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const addIndexIfMissing = async (tableName, indexName, fields) => {
      const existingIndexes = await queryInterface.showIndex(tableName);
      const hasIndex = existingIndexes.some((index) => index.name === indexName);
      if (!hasIndex) {
        await queryInterface.addIndex(tableName, fields, { name: indexName });
      }
    };

    await queryInterface.createTable('islands', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      weight: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
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
      islandVector: {
        type: Sequelize.JSON,
        allowNull: true
      },
      positiveSignals: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: '{"stars":0,"clicks":0,"deepReads":0}'
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

    await addIndexIfMissing('islands', 'islands_userId_idx', ['userId']);

    await addIndexIfMissing('islands', 'islands_user_weight_idx', ['userId', 'weight']);

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

    await addIndexIfMissing('island_topics', 'island_topics_topic_idx', ['topicId']);

    await addIndexIfMissing('island_topics', 'island_topics_confidence_idx', ['islandId', 'confidence']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('island_topics');
    await queryInterface.dropTable('islands');
  }
};
