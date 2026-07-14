'use strict';

const OLD_INDEX_NAMES = [
  'articles_contentHash_idx',
  'articles_userId_contentHash_idx',
  'articles_user_contenthash_crawl_idx',
  'articles_userId_contentHash_unique'
];
const NEW_SINGLE_INDEX = 'articles_contentSourceHash_idx';
const NEW_UNIQUE_INDEX = 'articles_userId_contentSourceHash_unique';

// This function reports whether the articles table contains a column.
const columnExists = async (queryInterface, columnName) => {
  const table = await queryInterface.describeTable('articles');
  return Boolean(table[columnName]);
};

// This function removes a named index when it exists.
const removeIndexIfPresent = async (queryInterface, name) => {
  const indexes = await queryInterface.showIndex('articles');
  if (indexes.some(index => index.name === name)) {
    await queryInterface.removeIndex('articles', name);
  }
};

// This function adds a named index when it does not exist.
const addIndexIfMissing = async (queryInterface, fields, options) => {
  const indexes = await queryInterface.showIndex('articles');
  if (!indexes.some(index => index.name === options.name)) {
    await queryInterface.addIndex('articles', fields, options);
  }
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Rename the source-body hash and preserve its lookup and uniqueness guarantees.
  async up(queryInterface) {
    for (const indexName of OLD_INDEX_NAMES) {
      await removeIndexIfPresent(queryInterface, indexName);
    }

    if (
      await columnExists(queryInterface, 'contentHash') &&
      !(await columnExists(queryInterface, 'contentSourceHash'))
    ) {
      await queryInterface.renameColumn('articles', 'contentHash', 'contentSourceHash');
    }

    if (await columnExists(queryInterface, 'contentSourceHash')) {
      await addIndexIfMissing(queryInterface, ['contentSourceHash'], {
        name: NEW_SINGLE_INDEX
      });
      await addIndexIfMissing(queryInterface, ['userId', 'contentSourceHash'], {
        unique: true,
        name: NEW_UNIQUE_INDEX
      });
    }
  },

  // Restore the previous source-body hash name and equivalent indexes.
  async down(queryInterface) {
    await removeIndexIfPresent(queryInterface, NEW_UNIQUE_INDEX);
    await removeIndexIfPresent(queryInterface, NEW_SINGLE_INDEX);

    if (
      await columnExists(queryInterface, 'contentSourceHash') &&
      !(await columnExists(queryInterface, 'contentHash'))
    ) {
      await queryInterface.renameColumn('articles', 'contentSourceHash', 'contentHash');
    }

    if (await columnExists(queryInterface, 'contentHash')) {
      await addIndexIfMissing(queryInterface, ['contentHash'], {
        name: 'articles_contentHash_idx'
      });
      await addIndexIfMissing(queryInterface, ['userId', 'contentHash'], {
        unique: true,
        name: 'articles_userId_contentHash_unique'
      });
    }
  }
};
