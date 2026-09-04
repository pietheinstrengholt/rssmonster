'use strict';

module.exports = {
  // Preserves each existing folder's effective user preference before making new folders opt in.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('smart_folders', 'markAsReadOnScroll', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.sequelize.query(`
      UPDATE \`smart_folders\`
      SET \`markAsReadOnScroll\` = COALESCE(
        (
          SELECT \`settings\`.\`markAsReadOnScroll\`
          FROM \`settings\`
          WHERE \`settings\`.\`userId\` = \`smart_folders\`.\`userId\`
          LIMIT 1
        ),
        1
      )
    `);

    await queryInterface.changeColumn('smart_folders', 'markAsReadOnScroll', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  // Removes only the Smart Folder scrolling preference introduced by this migration.
  async down(queryInterface) {
    await queryInterface.removeColumn('smart_folders', 'markAsReadOnScroll');
  }
};
