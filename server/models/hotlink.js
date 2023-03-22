const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const Hotlink = sequelize.define(
  "hotlinks",
  {
    url: {
      type: Sequelize.STRING,
      allowNull: false
    }
  },
  {
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

//sequelize assumes a primary key
Hotlink.removeAttribute('id');

module.exports = Hotlink;