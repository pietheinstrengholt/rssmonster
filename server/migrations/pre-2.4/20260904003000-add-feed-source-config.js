'use strict';

module.exports = {
  // Adds durable type-specific source rules without changing native feed records.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('feeds', 'sourceConfig', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('feeds', 'sourceConfig');
  }
};
