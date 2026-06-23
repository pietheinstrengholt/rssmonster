'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('categories', 'iconName', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('categories', 'iconName');
  }
};
