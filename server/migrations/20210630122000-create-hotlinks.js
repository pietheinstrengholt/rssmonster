'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(
      "hotlinks",
      {
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            // This is a reference to another model
            model: "users",

            // This is the column name of the referenced model
            key: "id"
          }
        },
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
  down: (queryInterface) => {
    return queryInterface.dropTable("hotlinks");
  }
};
