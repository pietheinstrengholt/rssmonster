'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  // Rename the persisted article grouping preference to match event terminology.
  async up(queryInterface) {
    await queryInterface.renameColumn('settings', 'clusterView', 'eventView');
  },

  // Restore the previous column name for rollback compatibility.
  async down(queryInterface) {
    await queryInterface.renameColumn('settings', 'eventView', 'clusterView');
  }
};
