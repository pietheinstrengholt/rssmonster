'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(
      "users",
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          allowNull: false,
          primaryKey: true
        },
        username: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true
        },
        password: {
          type: Sequelize.STRING,
          allowNull: false
        },
        hash: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true
        },
        role: {
          type: Sequelize.STRING,
          allowNull: false
        },
        lastLogin: {
          type: Sequelize.DATE
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
    return queryInterface.dropTable("users");
  }
};
