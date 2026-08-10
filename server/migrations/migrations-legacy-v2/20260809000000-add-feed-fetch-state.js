'use strict';

module.exports = {
  // Adds durable HTTP validators, observations, outcomes, and scheduling state.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('feeds', 'etag', {
      type: Sequelize.STRING(2048),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'lastModified', {
      type: Sequelize.STRING(1024),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'contentHash', {
      type: Sequelize.STRING(128),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'cacheFreshUntil', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'lastAttemptAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'lastSuccessAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'lastChangedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'lastPublishedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'observedEntryIntervalMs', {
      type: Sequelize.BIGINT,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'consecutiveFailures', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('feeds', 'nextFetchAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addColumn('feeds', 'lastFetchOutcome', {
      type: Sequelize.STRING(64),
      allowNull: true,
      defaultValue: null
    });
    await queryInterface.addIndex('feeds', ['status', 'nextFetchAt'], {
      name: 'feeds_status_nextFetchAt_idx'
    });
  },

  // Removes feed-fetch state in reverse dependency order.
  down: async queryInterface => {
    await queryInterface.removeIndex('feeds', 'feeds_status_nextFetchAt_idx');
    await queryInterface.removeColumn('feeds', 'lastFetchOutcome');
    await queryInterface.removeColumn('feeds', 'nextFetchAt');
    await queryInterface.removeColumn('feeds', 'consecutiveFailures');
    await queryInterface.removeColumn('feeds', 'observedEntryIntervalMs');
    await queryInterface.removeColumn('feeds', 'lastPublishedAt');
    await queryInterface.removeColumn('feeds', 'lastChangedAt');
    await queryInterface.removeColumn('feeds', 'lastSuccessAt');
    await queryInterface.removeColumn('feeds', 'lastAttemptAt');
    await queryInterface.removeColumn('feeds', 'cacheFreshUntil');
    await queryInterface.removeColumn('feeds', 'contentHash');
    await queryInterface.removeColumn('feeds', 'lastModified');
    await queryInterface.removeColumn('feeds', 'etag');
  }
};
