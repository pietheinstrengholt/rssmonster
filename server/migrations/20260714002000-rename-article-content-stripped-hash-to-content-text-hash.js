'use strict';

const OLD_INDEX = 'articles_userId_contentStrippedHash_idx';
const NEW_INDEX = 'articles_userId_contentTextHash_idx';

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

// This function adds the visible-text lookup index when it does not exist.
const addIndexIfMissing = async (queryInterface, fields, name) => {
  const indexes = await queryInterface.showIndex('articles');
  if (!indexes.some(index => index.name === name)) {
    await queryInterface.addIndex('articles', fields, { name });
  }
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Rename the visible-text hash while preserving its values and lookup index.
  async up(queryInterface) {
    await removeIndexIfPresent(queryInterface, OLD_INDEX);

    if (
      await columnExists(queryInterface, 'contentStrippedHash') &&
      !(await columnExists(queryInterface, 'contentTextHash'))
    ) {
      await queryInterface.renameColumn('articles', 'contentStrippedHash', 'contentTextHash');
    }

    if (await columnExists(queryInterface, 'contentTextHash')) {
      await addIndexIfMissing(
        queryInterface,
        ['userId', 'contentTextHash'],
        NEW_INDEX
      );
    }
  },

  // Restore the previous visible-text hash name and equivalent lookup index.
  async down(queryInterface) {
    await removeIndexIfPresent(queryInterface, NEW_INDEX);

    if (
      await columnExists(queryInterface, 'contentTextHash') &&
      !(await columnExists(queryInterface, 'contentStrippedHash'))
    ) {
      await queryInterface.renameColumn('articles', 'contentTextHash', 'contentStrippedHash');
    }

    if (await columnExists(queryInterface, 'contentStrippedHash')) {
      await addIndexIfMissing(
        queryInterface,
        ['userId', 'contentStrippedHash'],
        OLD_INDEX
      );
    }
  }
};
