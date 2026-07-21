'use strict';

module.exports = {
  // This migration adds the moving presentation article pointer to events.
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('events', 'developingArticleId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'articles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  // This migration removes the moving presentation article pointer from events.
  down: async queryInterface => {
    await queryInterface.removeColumn('events', 'developingArticleId');
  }
};
