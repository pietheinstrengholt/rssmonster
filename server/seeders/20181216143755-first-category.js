'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.bulkInsert('categories', [{
    userId: 1,
    name: 'Index',
    createdAt: Sequelize.literal('NOW()'),
    updatedAt: Sequelize.literal('NOW()')
  }], {}),

  down: (queryInterface) => queryInterface.bulkDelete('categories', null, {})
};