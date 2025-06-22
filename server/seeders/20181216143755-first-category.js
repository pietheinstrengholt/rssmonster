'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('categories', [{
      userId: 1,
      name: 'Index',
      createdAt: Sequelize.literal('NOW()'),
      updatedAt: Sequelize.literal('NOW()')
    }], {});
  },

  down: (queryInterface) => {
    return queryInterface.bulkDelete('categories', null, {});
  }
};