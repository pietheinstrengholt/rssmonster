'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('userClusterAffinities', {
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
      clusterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'article_clusters',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      topicKey: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      affinity: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0
      },
      interactionCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastInteractionAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      }
    });

    await queryInterface.addConstraint('userClusterAffinities', {
      fields: ['userId', 'clusterId'],
      type: 'unique',
      name: 'uq_user_cluster_affinities_user_cluster'
    });

    await queryInterface.addIndex('userClusterAffinities', ['userId', 'affinity']);
    await queryInterface.addIndex('userClusterAffinities', ['userId', 'topicKey']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('userClusterAffinities');
  }
};