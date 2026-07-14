'use strict';

const UNIQUE_INDEX = 'articles_userId_contentSourceHash_unique';
const LOOKUP_INDEX = 'articles_userId_contentSourceHash_idx';

// This function removes a named article index when it exists.
const removeIndexIfPresent = async (queryInterface, name) => {
  const indexes = await queryInterface.showIndex('articles');
  if (indexes.some(index => index.name === name)) {
    await queryInterface.removeIndex('articles', name);
  }
};

// This function adds a named article index when it does not exist.
const addIndexIfMissing = async (queryInterface, fields, options) => {
  const indexes = await queryInterface.showIndex('articles');
  if (!indexes.some(index => index.name === options.name)) {
    await queryInterface.addIndex('articles', fields, options);
  }
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Allow distinct articles to share source content while retaining duplicate lookup performance.
  async up(queryInterface) {
    await removeIndexIfPresent(queryInterface, UNIQUE_INDEX);
    await addIndexIfMissing(queryInterface, ['userId', 'contentSourceHash'], {
      name: LOOKUP_INDEX
    });
  },

  // Restore the former uniqueness rule when rollback data still satisfies it.
  async down(queryInterface) {
    await removeIndexIfPresent(queryInterface, LOOKUP_INDEX);
    await addIndexIfMissing(queryInterface, ['userId', 'contentSourceHash'], {
      unique: true,
      name: UNIQUE_INDEX
    });
  }
};
