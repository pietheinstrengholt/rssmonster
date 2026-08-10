'use strict';

module.exports = {
  // This migration adds independent article-type preferences to Daily Briefing settings.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('briefing_preferences', 'showOnlyInterestMatchedArticles', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'includeDevelopingEvents'
    });
    await queryInterface.addColumn('briefing_preferences', 'showOnlyDevelopingEventArticles', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'showOnlyInterestMatchedArticles'
    });
  },

  // This migration removes the Daily Briefing article-type preferences.
  down: async queryInterface => {
    await queryInterface.removeColumn(
      'briefing_preferences',
      'showOnlyDevelopingEventArticles'
    );
    await queryInterface.removeColumn(
      'briefing_preferences',
      'showOnlyInterestMatchedArticles'
    );
  }
};
