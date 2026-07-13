'use strict';

module.exports = {
  // This migration replaces the media placeholder with JSON media attributes.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('articles', 'media');

    await queryInterface.addColumn('articles', 'media', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      after: 'hotlinks'
    });
  },

  // This rollback restores the original Boolean media placeholder.
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('articles', 'media');

    await queryInterface.addColumn('articles', 'media', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'hotlinks'
    });
  }
};
