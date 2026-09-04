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
  // Repairs rows produced by the original backfill before the unread invariant was applied.
  async up(queryInterface) {
    const [folders] = await queryInterface.sequelize.query(`
      SELECT \`id\`, \`query\`, \`markAsReadOnScroll\`
      FROM \`smart_folders\`
      WHERE \`markAsReadOnScroll\` = 1
    `);
    const invalidFolderIds = folders
      .filter(folder => !queryRequiresUnread(folder.query))
      .map(folder => folder.id);

    if (invalidFolderIds.length > 0) {
      await queryInterface.bulkUpdate(
        'smart_folders',
        { markAsReadOnScroll: false },
        { id: invalidFolderIds }
      );
    }
  },

  // Invalid values cannot be reconstructed safely after they have been normalized.
  async down() {}
};
