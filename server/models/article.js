const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const cache = require('../util/cache');

const Article = sequelize.define(
  "articles",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "unread"
    },
    starInd: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    url: {
      type: Sequelize.STRING(1024),
      allowNull: false
    },
    hotlinks: {
      type: Sequelize.VIRTUAL,
      get() {
        return cache.get(this.url);
      }
    },
    imageUrl: Sequelize.STRING(1024),
    subject: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    content: Sequelize.TEXT("medium"),
    contentStripped: Sequelize.TEXT("medium"),
    language: Sequelize.TEXT("tiny"),
    published: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  },
  {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

module.exports = Article;
