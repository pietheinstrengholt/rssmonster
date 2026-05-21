'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDef = await queryInterface.describeTable('islands');

    if (!tableDef.populationAudit) {
      await queryInterface.addColumn('islands', 'populationAudit', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    const tableDef = await queryInterface.describeTable('islands');

    if (tableDef.populationAudit) {
      await queryInterface.removeColumn('islands', 'populationAudit');
    }
  }
};
