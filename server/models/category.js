const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const Category = sequelize.define(
  "categories",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    categoryOrder: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    }
  },
  {
    charset: "utf8",
    collate: "utf8_unicode_ci"
  }
);

module.exports = Category;
