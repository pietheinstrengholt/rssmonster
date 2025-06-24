'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(
      "settings",
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          allowNull: false,
          primaryKey: true
        },
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
        categoryId: {
          type: Sequelize.STRING,
          autoIncrement: false,
          allowNull: false,
          defaultValue: "%"
        },
        feedId: {
          type: Sequelize.STRING,
          autoIncrement: false,
          allowNull: false,
          defaultValue: "%"
        },
        status: {
          type: Sequelize.STRING,
          autoIncrement: false,
          allowNull: false,
          defaultValue: "unread"
        },
        sort: {
          type: Sequelize.STRING,
          autoIncrement: false,
          allowNull: false,
          defaultValue: "DESC"
        },
        createdAt: {
          type: Sequelize.DATE
        },
        updatedAt: {
          type: Sequelize.DATE
        }
      },
      {
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci"
      }
    );
  },
  down: (queryInterface) => {
    return queryInterface.dropTable("settings");
  }
};
