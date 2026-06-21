'use strict';

module.exports = {
  up: async queryInterface => {
    await queryInterface.addIndex('articles', ['userId', 'contentHash'], {
      name: 'articles_userId_contentHash_idx'
    });
  },

  down: async queryInterface => {
    await queryInterface.removeIndex('articles', 'articles_userId_contentHash_idx');
  }
};
