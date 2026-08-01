'use strict';

module.exports = {
  // This migration adds the user's automatic mark-as-read scrolling preference.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('settings', 'markAsReadOnScroll', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      after: 'startupViewMode'
    });
  },

  // This migration removes the user's automatic mark-as-read scrolling preference.
  down: async queryInterface => {
    await queryInterface.removeColumn('settings', 'markAsReadOnScroll');
  }
};
