'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
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
      archivedInd: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      archivedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      positiveSignals: {
        type: Sequelize.JSON,
        allowNull: false
      },
      populationAudit: {
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

    await queryInterface.addIndex('islands', ['userId'], {
      name: 'islands_userId_idx'
    });
    await queryInterface.addIndex('islands', ['userId', 'weight'], {
      name: 'islands_user_weight_idx'
    });
    await queryInterface.addIndex('islands', ['userId', 'archivedInd'], {
      name: 'islands_user_archived_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('islands');
  }
};
