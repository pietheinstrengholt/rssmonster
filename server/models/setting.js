const Sequelize = require("sequelize");
var DataTypes = require("sequelize/lib/data-types");
const sequelize = require("../util/database");

const Setting = sequelize.define(
  "settings",
  {
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
    }
  },
  {
    charset: "utf8",
    collate: "utf8_unicode_ci"
  }
);

module.exports = Setting;
