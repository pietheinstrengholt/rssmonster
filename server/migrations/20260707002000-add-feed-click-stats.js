'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('feeds', 'feedClickAvg', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
      after: 'feedIgnoreRatio'
    });

    await queryInterface.addColumn('feeds', 'feedClickRatio', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0,
      after: 'feedClickAvg'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('feeds', 'feedClickRatio');
    await queryInterface.removeColumn('feeds', 'feedClickAvg');
  }
};
