import sequelize from "../util/database.js";

export default {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('categories', [{
      name: 'Index',
      createdAt: sequelize.literal('NOW()'),
      updatedAt: sequelize.literal('NOW()')
    }], {});
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('categories', null, {});
  }
};