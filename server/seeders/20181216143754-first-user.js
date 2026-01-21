'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.bulkInsert('users', [{
    username: 'rssmonster',
    password: "$2a$12$1XdLGt8wKPV4YOsrpCHZX.99JD8uWIThKJFBTp/HoZ8PhWHYcr5.q", // 'rssmonster'
    hash: '24574b626127fcb78f4d122973dcd613', //md5 of 'username:password'
    role: 'admin',
    createdAt: Sequelize.literal('NOW()'),
    updatedAt: Sequelize.literal('NOW()')
  }], {}),

  down: (queryInterface) => queryInterface.bulkDelete('users', null, {})
};