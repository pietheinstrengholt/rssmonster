'use strict';

module.exports = {
  // This migration adds the user's preferred startup selection behavior.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('settings', 'startupViewMode', {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: 'last-used',
      after: 'themeMode'
    });
  },

  // This migration removes the user's preferred startup selection behavior.
  down: async queryInterface => {
    await queryInterface.removeColumn('settings', 'startupViewMode');
  }
};
