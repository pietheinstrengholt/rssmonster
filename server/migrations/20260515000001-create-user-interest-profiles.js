'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('userInterestProfiles', {
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
      label: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      topicKey: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      vector: {
        type: Sequelize.JSON,
        allowNull: false
      },
      weight: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0
      },
      interactionCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastSeen: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      }
    });

    await queryInterface.addIndex('userInterestProfiles', ['userId', 'weight']);
    await queryInterface.addIndex('userInterestProfiles', ['userId', 'lastSeen']);
    await queryInterface.addIndex('userInterestProfiles', ['userId', 'topicKey']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('userInterestProfiles');
  }
};