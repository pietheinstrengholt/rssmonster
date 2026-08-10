'use strict';

module.exports = {
  // This migration renames the persisted action type to match discard terminology.
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE actions
      SET actionType = 'discard'
      WHERE actionType = 'delete'
    `);
  },

  // This migration restores the previous persisted action type.
  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE actions
      SET actionType = 'delete'
      WHERE actionType = 'discard'
    `);
  }
};
