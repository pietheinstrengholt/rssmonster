'use strict';

const preferenceColumns = [
  'includeOnlyUnreadArticles',
  'includeDevelopingEvents',
  'prioritizeHighTrust'
];

module.exports = {
  // This migration disables optional Briefing preference flags by default.
  up: async (queryInterface, Sequelize) => {
    for (const column of preferenceColumns) {
      await queryInterface.changeColumn('briefing_preferences', column, {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  // This migration restores the original enabled defaults.
  down: async (queryInterface, Sequelize) => {
    for (const column of preferenceColumns) {
      await queryInterface.changeColumn('briefing_preferences', column, {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  }
};
