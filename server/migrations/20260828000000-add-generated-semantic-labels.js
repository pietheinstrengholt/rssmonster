'use strict';

module.exports = {
  // Adds optional generated presentation names without changing deterministic semantic names.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('events', 'generatedName', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null,
      after: 'name'
    });
    await queryInterface.addColumn('topics', 'generatedName', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null,
      after: 'name'
    });
    await queryInterface.addColumn('islands', 'generatedLabel', {
      type: Sequelize.STRING(255),
      allowNull: true,
      defaultValue: null,
      after: 'label'
    });
  },

  // Removes generated presentation names in reverse dependency order.
  async down(queryInterface) {
    await queryInterface.removeColumn('islands', 'generatedLabel');
    await queryInterface.removeColumn('topics', 'generatedName');
    await queryInterface.removeColumn('events', 'generatedName');
  }
};
