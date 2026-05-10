'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableDefinition = await queryInterface.describeTable('articles');

    if (!tableDefinition.seenInd) {
      await queryInterface.addColumn('articles', 'seenInd', {
        type: Sequelize.TINYINT,
        allowNull: false,
        defaultValue: 0
      });
    }

    // Backfill seenInd from firstSeen to keep existing data consistent.
    await queryInterface.sequelize.query(`
      UPDATE articles
      SET seenInd = CASE WHEN firstSeen IS NULL THEN 0 ELSE 1 END
    `);

    const indexes = await queryInterface.showIndex('articles');
    const hasSeenPublishedIndex = indexes.some((index) => index.name === 'articles_userId_seenInd_published_idx');

    if (!hasSeenPublishedIndex) {
      await queryInterface.addIndex('articles', ['userId', 'seenInd', 'published'], {
        name: 'articles_userId_seenInd_published_idx'
      });
    }
  },

  down: async (queryInterface) => {
    const indexes = await queryInterface.showIndex('articles');
    const hasSeenPublishedIndex = indexes.some((index) => index.name === 'articles_userId_seenInd_published_idx');

    if (hasSeenPublishedIndex) {
      await queryInterface.removeIndex('articles', 'articles_userId_seenInd_published_idx');
    }

    const tableDefinition = await queryInterface.describeTable('articles');
    if (tableDefinition.seenInd) {
      await queryInterface.removeColumn('articles', 'seenInd');
    }
  }
};
