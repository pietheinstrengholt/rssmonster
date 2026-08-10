'use strict';

module.exports = {
  // This function adds sanitized and plain-text description derivatives.
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('articles', 'descriptionHtml', {
      type: Sequelize.TEXT('medium'),
      allowNull: true,
      defaultValue: null,
      after: 'description'
    });
    await queryInterface.addColumn('articles', 'descriptionText', {
      type: Sequelize.TEXT('medium'),
      allowNull: true,
      defaultValue: null,
      after: 'descriptionHtml'
    });
  },

  // This function removes description derivatives during rollback.
  async down(queryInterface) {
    await queryInterface.removeColumn('articles', 'descriptionText');
    await queryInterface.removeColumn('articles', 'descriptionHtml');
  }
};
