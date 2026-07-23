'use strict';

module.exports = {
  // This migration adds the timestamp when an article was explicitly marked as read.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'readAt', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      after: 'firstSeen'
    });
  },

  // This migration removes the explicit article read timestamp.
  down: async queryInterface => {
    await queryInterface.removeColumn('articles', 'readAt');
  }
};
