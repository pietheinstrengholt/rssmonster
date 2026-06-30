'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_userId_starInd_published_idx');
    await queryInterface.removeIndex('articles', 'articles_starInd_idx');

    await queryInterface.renameColumn('articles', 'starInd', 'favoriteInd');

    await queryInterface.addIndex('articles', ['favoriteInd'], {
      name: 'articles_favoriteInd_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'favoriteInd', 'published'], {
      name: 'articles_userId_favoriteInd_published_idx'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_userId_favoriteInd_published_idx');
    await queryInterface.removeIndex('articles', 'articles_favoriteInd_idx');

    await queryInterface.renameColumn('articles', 'favoriteInd', 'starInd');

    await queryInterface.addIndex('articles', ['starInd'], {
      name: 'articles_starInd_idx'
    });
    await queryInterface.addIndex('articles', ['userId', 'starInd', 'published'], {
      name: 'articles_userId_starInd_published_idx'
    });
  }
};
