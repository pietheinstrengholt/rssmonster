'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('feeds', 'feedTrust', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0.75
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('feeds', 'feedTrust', {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0.5
    });
  }
};
