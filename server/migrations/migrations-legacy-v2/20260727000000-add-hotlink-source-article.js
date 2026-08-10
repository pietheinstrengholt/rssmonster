'use strict';

const COLUMN_NAME = 'sourceArticleId';
const INDEX_NAME = 'hotlinks_sourceArticleId_idx';
const DATE_INDEX_NAME = 'hotlinks_userId_createdAt_idx';

module.exports = {
  // This migration records which accepted article contributed each hotlink observation.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('hotlinks', COLUMN_NAME, {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'articles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
      after: 'feedId'
    });
    await queryInterface.addIndex('hotlinks', [COLUMN_NAME], {
      name: INDEX_NAME
    });
    await queryInterface.addIndex('hotlinks', ['userId', 'createdAt'], {
      name: DATE_INDEX_NAME
    });
  },

  // This migration removes hotlink source provenance.
  down: async queryInterface => {
    await queryInterface.removeIndex('hotlinks', DATE_INDEX_NAME);
    await queryInterface.removeIndex('hotlinks', INDEX_NAME);
    await queryInterface.removeColumn('hotlinks', COLUMN_NAME);
  }
};
