'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('articles', 'filteredInd', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      after: 'status'
    });

    await queryInterface.sequelize.query(`
      UPDATE articles
      SET filteredInd = true, status = 'unread'
      WHERE status = 'delete'
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE articles
      SET status = 'delete'
      WHERE filteredInd = true
    `);

    await queryInterface.removeColumn('articles', 'filteredInd');
  }
};
