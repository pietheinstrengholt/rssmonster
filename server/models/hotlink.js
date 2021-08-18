const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const Article = require("./article");

const Hotlink = sequelize.define(
  "hotlinks",
  {
    url: {
      type: Sequelize.STRING,
      allowNull: false,
      references: {
        // This is a reference to another model
        model: Article,

        // This is the column name of the referenced model
        key: "url"
      }
    }
  },
  {
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

//sequelize assumes a primary key
//Hotlink.removeAttribute('id');

module.exports = Hotlink;