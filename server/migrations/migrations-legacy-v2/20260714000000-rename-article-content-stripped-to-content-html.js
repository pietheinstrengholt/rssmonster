'use strict';

// This function reports whether the articles table contains a column.
const columnExists = async (queryInterface, columnName) => {
  const table = await queryInterface.describeTable('articles');
  return Boolean(table[columnName]);
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Rename sanitized display HTML without copying or reprocessing stored content.
  async up(queryInterface) {
    if (
      await columnExists(queryInterface, 'contentStripped') &&
      !(await columnExists(queryInterface, 'contentHtml'))
    ) {
      await queryInterface.renameColumn('articles', 'contentStripped', 'contentHtml');
    }
  },

  // Restore the previous display HTML column name on rollback.
  async down(queryInterface) {
    if (
      await columnExists(queryInterface, 'contentHtml') &&
      !(await columnExists(queryInterface, 'contentStripped'))
    ) {
      await queryInterface.renameColumn('articles', 'contentHtml', 'contentStripped');
    }
  }
};
