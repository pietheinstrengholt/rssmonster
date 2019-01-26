'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('settings', {
      key_name: {
        type: Sequelize.STRING,
        autoIncrement: false,
        allowNull: false,
        primaryKey: true,
        unique: true
      },
      key_value: {
        type: Sequelize.STRING,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE
      },
      updatedAt: {
        type: Sequelize.DATE
      }
    }, {
      charset: "utf8",
      collate: "utf8_unicode_ci"
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('articles');
  }
};