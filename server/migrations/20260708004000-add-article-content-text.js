'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'contentText', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
      after: 'contentStripped'
    });
  },

  down: async queryInterface => {
    await queryInterface.removeColumn('articles', 'contentText');
  }
};
