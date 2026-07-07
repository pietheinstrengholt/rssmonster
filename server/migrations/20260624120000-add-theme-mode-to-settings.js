'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.addColumn('settings', 'themeMode', {
    type: Sequelize.STRING(10),
    allowNull: false,
    defaultValue: 'system'
  }),

  down: queryInterface => queryInterface.removeColumn('settings', 'themeMode')
};
