'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDef = await queryInterface.describeTable('articles');

    if (!tableDef.positiveInd) {
      await queryInterface.addColumn('articles', 'positiveInd', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        after: 'negativeInd'
      });
    }
  },

  down: async (queryInterface) => {
    const tableDef = await queryInterface.describeTable('articles');

    if (tableDef.positiveInd) {
      await queryInterface.removeColumn('articles', 'positiveInd');
    }
  }
};
