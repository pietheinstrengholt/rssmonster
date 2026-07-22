'use strict';

const TABLE_NAME = 'events';
const COLUMN_NAME = 'developingArticleId';
const CONSTRAINT_NAME = 'events_developingArticleId_fkey';

// This function replaces the developing article foreign key with the requested delete action.
async function replaceDevelopingArticleConstraint(queryInterface, onDelete) {
  const foreignKeys = await queryInterface.getForeignKeyReferencesForTable(TABLE_NAME);
  const existingConstraint = foreignKeys.find(reference => reference.columnName === COLUMN_NAME);

  if (existingConstraint?.constraintName) {
    await queryInterface.removeConstraint(TABLE_NAME, existingConstraint.constraintName);
  }

  await queryInterface.addConstraint(TABLE_NAME, {
    fields: [COLUMN_NAME],
    type: 'foreign key',
    name: CONSTRAINT_NAME,
    references: {
      table: 'articles',
      field: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete
  });
}

module.exports = {
  // This migration preserves events when their developing presentation article is deleted.
  up: async queryInterface => {
    await replaceDevelopingArticleConstraint(queryInterface, 'SET NULL');
  },

  // This migration restores the original cascading delete behavior.
  down: async queryInterface => {
    await replaceDevelopingArticleConstraint(queryInterface, 'CASCADE');
  }
};
