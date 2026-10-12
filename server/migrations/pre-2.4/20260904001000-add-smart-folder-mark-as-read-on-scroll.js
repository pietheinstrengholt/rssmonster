'use strict';

// Mirrors the article-query parser's last-token-wins behavior for the unread filter.
const queryRequiresUnread = query => {
  let unread = false;

  for (const token of String(query || '').match(/(?:[A-Za-z]+:)?"[^"]*"|\S+/g) || []) {
    const match = token.replace(/[.,;]+$/, '').match(/^unread:(true|false)$/i);
    if (match) unread = match[1].toLowerCase() === 'true';
  }

  return unread;
};

module.exports = {
  // Preserves the legacy preference only where scrolling can validly mark articles read.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('smart_folders', 'markAsReadOnScroll', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: null
    });

    const [folders] = await queryInterface.sequelize.query(`
      SELECT
        \`smart_folders\`.\`id\`,
        \`smart_folders\`.\`query\`,
        COALESCE(\`settings\`.\`markAsReadOnScroll\`, 1) AS \`legacyMarkAsReadOnScroll\`
      FROM \`smart_folders\`
      LEFT JOIN \`settings\`
        ON \`settings\`.\`userId\` = \`smart_folders\`.\`userId\`
    `);

    await queryInterface.bulkUpdate('smart_folders', { markAsReadOnScroll: false }, {});

    const enabledFolderIds = folders
      .filter(folder => Boolean(folder.legacyMarkAsReadOnScroll) && queryRequiresUnread(folder.query))
      .map(folder => folder.id);
    if (enabledFolderIds.length > 0) {
      await queryInterface.bulkUpdate(
        'smart_folders',
        { markAsReadOnScroll: true },
        { id: enabledFolderIds }
      );
    }

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
