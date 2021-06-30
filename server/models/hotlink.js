const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const Hotlink = sequelize.define(
  "hotlinks",
  {
    url: {
      type: Sequelize.STRING(1024),
      allowNull: false
    }
  },
  {
    updatedAt: false,
    charset: "utf8",
    collate: "utf8_unicode_ci"
  }
);

//sequelize assumes a primary key
Hotlink.removeAttribute('id');

module.exports = Hotlink;
