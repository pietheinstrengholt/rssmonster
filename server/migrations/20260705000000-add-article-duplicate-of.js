'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'duplicateOfArticleId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'articles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('articles', ['duplicateOfArticleId'], {
      name: 'articles_duplicateOfArticleId_idx'
    });

    await queryInterface.addIndex('articles', ['userId', 'duplicateOfArticleId', 'published'], {
      name: 'articles_userId_duplicateOfArticleId_published_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_userId_duplicateOfArticleId_published_idx');
    await queryInterface.removeIndex('articles', 'articles_duplicateOfArticleId_idx');
    await queryInterface.removeColumn('articles', 'duplicateOfArticleId');
  }
};
