'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.renameColumn('articles', 'published', 'publishedAt');

    await queryInterface.addColumn('articles', 'modifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      after: 'publishedAt'
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('articles', 'modifiedAt');
    await queryInterface.renameColumn('articles', 'publishedAt', 'published');
  }
};
