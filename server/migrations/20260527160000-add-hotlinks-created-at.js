'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('hotlinks');

    if (!table.createdAt) {
      await queryInterface.addColumn('hotlinks', 'createdAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('hotlinks');

    if (table.createdAt) {
      await queryInterface.removeColumn('hotlinks', 'createdAt');
    }
  }
};
