'use strict';

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    // Add foreign key constraint to articles.clusterId
    await queryInterface.addConstraint('articles', {
      fields: ['clusterId'],
      type: 'foreign key',
      name: 'articles_clusterId_fkey',
      references: {
        table: 'article_clusters',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface) => {
    // Remove foreign key constraint
    await queryInterface.removeConstraint('articles', 'articles_clusterId_fkey');
  }
};
