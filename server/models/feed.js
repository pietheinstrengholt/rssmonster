const Sequelize = require("sequelize");

var DataTypes = require("sequelize/lib/data-types");

const sequelize = require("../util/database");

const Category = require("./category");

const Feed = sequelize.define(
  "feeds",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    // It is possible to create foreign keys:
    categoryId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        // This is a reference to another model
        model: Category,

        // This is the column name of the referenced model
        key: "id"
      }
    },
    feedName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    feedDesc: Sequelize.TEXT,
    url: {
      type: Sequelize.STRING
    },
    rssUrl: {
      type: Sequelize.STRING,
      unique: true
    },
    favicon: Sequelize.STRING,
    errorCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    }
  },
  {
    charset: "utf8",
    collate: "utf8_unicode_ci"
  }
);

module.exports = Feed;
