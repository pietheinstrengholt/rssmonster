'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('events', 'status', {
      type: Sequelize.ENUM('emerging', 'active', 'cooling', 'archived'),
      allowNull: true,
      defaultValue: 'emerging'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "UPDATE events SET status = 'active' WHERE status = 'emerging'"
    );

    await queryInterface.changeColumn('events', 'status', {
      type: Sequelize.ENUM('active', 'cooling', 'archived'),
      allowNull: true,
      defaultValue: 'active'
    });
  }
};