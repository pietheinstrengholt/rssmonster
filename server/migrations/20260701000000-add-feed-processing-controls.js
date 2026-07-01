'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('feeds', 'updateIntervalMinutes', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      after: 'lastFetched'
    });

    await queryInterface.addColumn('feeds', 'feedTags', {
      type: Sequelize.JSON,
      allowNull: true,
      after: 'lastFetched'
    });

    await queryInterface.sequelize.query('UPDATE feeds SET feedTags = JSON_ARRAY() WHERE feedTags IS NULL');

    await queryInterface.changeColumn('feeds', 'feedTags', {
      type: Sequelize.JSON,
      allowNull: false
    });

    await queryInterface.addColumn('feeds', 'generateEmbeddings', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      after: 'lastFetched'
    });

    await queryInterface.addColumn('feeds', 'applyAiAnalysis', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      after: 'lastFetched'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('feeds', 'applyAiAnalysis');
    await queryInterface.removeColumn('feeds', 'generateEmbeddings');
    await queryInterface.removeColumn('feeds', 'feedTags');
    await queryInterface.removeColumn('feeds', 'updateIntervalMinutes');
  }
};
