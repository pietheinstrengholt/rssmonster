'use strict';

module.exports = {
  // This migration adds the grouped-event developing-story presentation setting.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('settings', 'includeDevelopingEvents', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'grouping'
    });
  },

  // This migration removes the grouped-event developing-story presentation setting.
  down: async queryInterface => {
    await queryInterface.removeColumn('settings', 'includeDevelopingEvents');
  }
};
