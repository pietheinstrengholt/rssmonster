'use strict';

module.exports = {
  up: async (queryInterface) => {
    // events: userId + updatedAt supports user event timelines
    await queryInterface.addIndex(
      'events',
      ['userId', 'updatedAt'],
      { name: 'events_userId_updatedAt_idx' }
    );

    // articles: compound index for incremental event assignment lookup
    // (userId, eventId, published) covers the WHERE + ORDER BY
    await queryInterface.addIndex(
      'articles',
      ['userId', 'eventId', 'published'],
      { name: 'articles_userId_eventId_published_idx' }
    );

    // articles: compound index for topic timeline queries
    await queryInterface.addIndex(
      'articles',
      ['userId', 'topicId', 'published'],
      { name: 'articles_userId_topicId_published_idx' }
    );

    // articles: compound index for status-based timeline queries
    await queryInterface.addIndex(
      'articles',
      ['userId', 'status', 'published'],
      { name: 'articles_userId_status_published_idx' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('events', 'events_userId_updatedAt_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_eventId_published_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_topicId_published_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_status_published_idx');
  }
};