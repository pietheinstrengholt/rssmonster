'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'externalId', {
      type: Sequelize.STRING(1024),
      allowNull: true,
      defaultValue: null,
      after: 'id'
    });

    await queryInterface.addColumn('articles', 'externalIdType', {
      type: Sequelize.STRING(64),
      allowNull: true,
      defaultValue: null,
      after: 'externalId'
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('articles', 'externalIdType');
    await queryInterface.removeColumn('articles', 'externalId');
  }
};
