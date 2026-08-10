'use strict';

// This function removes a named index when it exists.
const removeIndexIfPresent = async (queryInterface, tableName, name) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (indexes.some(index => index.name === name)) {
    await queryInterface.removeIndex(tableName, name);
  }
};

// This function adds an index only when the name is not already present.
const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName);
  if (indexes.some(index => index.name === options.name)) {
    return;
  }

  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  up: async queryInterface => {
    await queryInterface.sequelize.query(`
      UPDATE articles duplicate_articles
      INNER JOIN articles canonical_articles
        ON canonical_articles.userId = duplicate_articles.userId
        AND canonical_articles.contentHash = duplicate_articles.contentHash
        AND canonical_articles.id < duplicate_articles.id
      SET duplicate_articles.contentHash = NULL
      WHERE duplicate_articles.contentHash IS NOT NULL
    `);

    await removeIndexIfPresent(queryInterface, 'articles', 'articles_user_contenthash_crawl_idx');
    await removeIndexIfPresent(queryInterface, 'articles', 'articles_userId_contentHash_idx');

    await addIndexIfMissing(queryInterface, 'articles', ['userId', 'contentHash'], {
      unique: true,
      name: 'articles_userId_contentHash_unique'
    });

    await addIndexIfMissing(queryInterface, 'articles', ['userId', 'contentStrippedHash'], {
      name: 'articles_userId_contentStrippedHash_idx'
    });
  },

  down: async queryInterface => {
    await removeIndexIfPresent(queryInterface, 'articles', 'articles_userId_contentHash_unique');
    await removeIndexIfPresent(queryInterface, 'articles', 'articles_userId_contentStrippedHash_idx');

    await addIndexIfMissing(queryInterface, 'articles', ['userId', 'contentHash'], {
      name: 'articles_userId_contentHash_idx'
    });
  }
};
