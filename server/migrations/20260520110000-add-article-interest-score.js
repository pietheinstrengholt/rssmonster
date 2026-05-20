'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDef = await queryInterface.describeTable('articles');

    if (!tableDef.interestScore) {
      await queryInterface.addColumn('articles', 'interestScore', {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  down: async (queryInterface) => {
    const tableDef = await queryInterface.describeTable('articles');

    if (tableDef.interestScore) {
      await queryInterface.removeColumn('articles', 'interestScore');
    }
  }
};
