'use strict';

module.exports = {
  // This migration removes the retired muted-interest snapshots.
  async up(queryInterface) {
    await queryInterface.removeColumn('briefing_preferences', 'mutedInterestIslands');
  },

  // This migration restores the retired snapshots when rolling back.
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('briefing_preferences', 'mutedInterestIslands', {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: Sequelize.literal('(JSON_ARRAY())')
    });
  }
};
