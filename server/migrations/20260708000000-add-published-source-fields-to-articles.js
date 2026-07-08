'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'publishedSource', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      after: 'published'
    });

    await queryInterface.addColumn('articles', 'publishInferred', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'publishedSource'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('articles', 'publishInferred');
    await queryInterface.removeColumn('articles', 'publishedSource');
  }
};
