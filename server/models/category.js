const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const Feed = require("./feed");

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
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

//add associations
Category.hasMany(Feed);
Feed.belongsTo(Category);

module.exports = Category;
