'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(
      "hotlinks",
      {
        url: {
          type: Sequelize.TEXT('medium'),
          allowNull: false
        },
        createdAt: {
          type: Sequelize.DATE
        },
      },
      {
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci"
      }
    );
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable("hotlinks");
  }
};
