'use strict';

module.exports = {
  up: async (queryInterface) => {
    const indexExists = async (table, indexName) => {
      const indexes = await queryInterface.showIndex(table);
      return indexes.some(idx => idx.name === indexName);
    };

    // (userId, feedId, status, published) for feed-specific timeline queries.
    if (!await indexExists('articles', 'articles_userId_feedId_status_published_idx')) {
      await queryInterface.addIndex(
        'articles',
        ['userId', 'feedId', 'status', 'published'],
        { name: 'articles_userId_feedId_status_published_idx' }
      );
    }

    // (userId, starInd, published) for starred-article timeline and ranking loads.
    if (!await indexExists('articles', 'articles_userId_starInd_published_idx')) {
      await queryInterface.addIndex(
        'articles',
        ['userId', 'starInd', 'published'],
        { name: 'articles_userId_starInd_published_idx' }
      );
    }

    // (userId, topicId, eventStrength) supports topic-group strongest-event selection.
    if (!await indexExists('events', 'events_userId_topicId_eventStrength_idx')) {
      await queryInterface.addIndex(
        'events',
        ['userId', 'topicId', 'eventStrength'],
        { name: 'events_userId_topicId_eventStrength_idx' }
      );
    }
  },

  down: async (queryInterface) => {
    const indexExists = async (table, indexName) => {
      const indexes = await queryInterface.showIndex(table);
      return indexes.some(idx => idx.name === indexName);
    };

    if (await indexExists('articles', 'articles_userId_feedId_status_published_idx')) {
      await queryInterface.removeIndex('articles', 'articles_userId_feedId_status_published_idx');
    }

    if (await indexExists('articles', 'articles_userId_starInd_published_idx')) {
      await queryInterface.removeIndex('articles', 'articles_userId_starInd_published_idx');
    }

    if (await indexExists('events', 'events_userId_topicId_eventStrength_idx')) {
      await queryInterface.removeIndex('events', 'events_userId_topicId_eventStrength_idx');
    }
  }
};
