'use strict';

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    // Add foreign key constraint to articles.eventId
    await queryInterface.addConstraint('articles', {
      fields: ['eventId'],
      type: 'foreign key',
      name: 'articles_eventId_fkey',
      references: {
        table: 'events',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add foreign key constraint to articles.topicId
    await queryInterface.addConstraint('articles', {
      fields: ['topicId'],
      type: 'foreign key',
      name: 'articles_topicId_fkey',
      references: {
        table: 'topics',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeConstraint('articles', 'articles_topicId_fkey');
    await queryInterface.removeConstraint('articles', 'articles_eventId_fkey');
  }
};