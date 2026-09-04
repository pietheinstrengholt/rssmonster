'use strict';

module.exports = {
  // Adds opt-in, timezone-aware email delivery settings without changing existing behavior.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('briefing_preferences', 'emailDigestEnabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('briefing_preferences', 'emailDigestTime', {
      type: Sequelize.STRING(5),
      allowNull: false,
      defaultValue: '08:00'
    });
    await queryInterface.addColumn('briefing_preferences', 'emailDigestTimezone', {
      type: Sequelize.STRING(64),
      allowNull: false,
      defaultValue: 'UTC'
    });
    await queryInterface.addColumn('briefing_preferences', 'emailDigestSkipWhenEmpty', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  },

  // Removes only the email scheduling preferences owned by this migration.
  async down(queryInterface) {
    await queryInterface.removeColumn('briefing_preferences', 'emailDigestSkipWhenEmpty');
    await queryInterface.removeColumn('briefing_preferences', 'emailDigestTimezone');
    await queryInterface.removeColumn('briefing_preferences', 'emailDigestTime');
    await queryInterface.removeColumn('briefing_preferences', 'emailDigestEnabled');
  }
};
