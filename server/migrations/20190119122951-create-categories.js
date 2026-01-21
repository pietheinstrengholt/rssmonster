'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => queryInterface.createTable('categories', {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    // It is possible to create foreign keys:
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
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    categoryOrder: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    createdAt: {
      type: Sequelize.DATE
    },
    updatedAt: {
      type: Sequelize.DATE
    }
  }, {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }),
  down: (queryInterface) => queryInterface.dropTable('categories')
};