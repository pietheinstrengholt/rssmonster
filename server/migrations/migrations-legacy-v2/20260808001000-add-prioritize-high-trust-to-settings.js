'use strict';

module.exports = {
  // This migration adds the generic unread high-trust preference without enabling ranking yet.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('settings', 'prioritizeHighTrust', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'includeDevelopingEvents'
    });
  },

  // This migration removes the generic unread high-trust preference.
  down: async queryInterface => {
    await queryInterface.removeColumn('settings', 'prioritizeHighTrust');
  }
};
