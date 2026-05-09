'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'similarityScore', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null
    });

    await queryInterface.addIndex('articles', ['userId', 'similarityScore'], {
      name: 'articles_userId_similarityScore_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_userId_similarityScore_idx');
    await queryInterface.removeColumn('articles', 'similarityScore');
  }
};
