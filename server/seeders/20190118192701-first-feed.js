import sequelize from "../util/database.js";

export default {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('feeds', [{
      categoryId: 1,
      feedName: 'reddit.com',
      feedDesc: 'reddit: the front page of the internet',
      url: "https://www.reddit.com/.rss",
      rssUrl: "https://www.reddit.com/.rss",
      createdAt: sequelize.literal('NOW()'),
      updatedAt: sequelize.literal('NOW()')
    }], {});
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('feeds', null, {});
  }
};