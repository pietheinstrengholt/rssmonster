const Sequelize = require("sequelize");
var DataTypes = require("sequelize/lib/data-types");
const sequelize = require("../util/database");

const Setting = sequelize.define(
  "settings",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
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
    }
  },
  {
    charset: "utf8",
    collate: "utf8_unicode_ci"
  }
);

module.exports = Setting;
