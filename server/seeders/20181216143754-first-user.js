'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('users', [{
      username: 'rssmonster',
      password: "$2a$12$1XdLGt8wKPV4YOsrpCHZX.99JD8uWIThKJFBTp/HoZ8PhWHYcr5.q", // 'rssmonster'
      role: 'admin',
      createdAt: Sequelize.literal('NOW()'),
      updatedAt: Sequelize.literal('NOW()')
    }], {});
  },

  down: (queryInterface) => {
    return queryInterface.bulkDelete('users', null, {});
  }
};