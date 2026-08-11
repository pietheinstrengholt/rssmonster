'use strict';

const INDEX_NAME = 'articles_title_contentText_fulltext_idx';

module.exports = {
  async up(queryInterface) {
    // SQLite full-text search requires a synchronized FTS virtual table rather than an index.
    if (queryInterface.sequelize.getDialect() === 'sqlite') return;

    await queryInterface.addIndex('articles', ['title', 'contentText'], {
      name: INDEX_NAME,
      type: 'FULLTEXT'
    });
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() === 'sqlite') return;

    await queryInterface.removeIndex('articles', INDEX_NAME);
  }
};
