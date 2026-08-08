'use strict';

module.exports = {
  // This migration adds briefing-specific automatic read handling while scrolling.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('briefing_preferences', 'markAsReadOnScroll', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'includeOnlyUnreadArticles'
    });
  },

  // This migration removes the briefing-specific scrolling preference.
  down: async queryInterface => {
    await queryInterface.removeColumn('briefing_preferences', 'markAsReadOnScroll');
  }
};
