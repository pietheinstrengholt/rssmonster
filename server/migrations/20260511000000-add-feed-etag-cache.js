'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable('feeds');

    if (!tableDefinition.etag) {
      await queryInterface.addColumn('feeds', 'etag', {
        type: Sequelize.STRING(256),
        allowNull: true,
        defaultValue: null
      });
    }

    if (!tableDefinition.lastModified) {
      await queryInterface.addColumn('feeds', 'lastModified', {
        type: Sequelize.STRING(64),
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async (queryInterface) => {
    const tableDefinition = await queryInterface.describeTable('feeds');

    if (tableDefinition.etag) {
      await queryInterface.removeColumn('feeds', 'etag');
    }

    if (tableDefinition.lastModified) {
      await queryInterface.removeColumn('feeds', 'lastModified');
    }
  }
};
