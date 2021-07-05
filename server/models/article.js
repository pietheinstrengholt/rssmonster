const Sequelize = require("sequelize");

const sequelize = require("../util/database");

const Feed = require("./feed");
const Hotlink = require("./hotlink");

const Article = sequelize.define(
  "articles",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    // It is possible to create foreign keys:
    feedId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        // This is a reference to another model
        model: Feed,

        // This is the column name of the referenced model
        key: "id"
      }
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
    charset: "utf8",
    collate: "utf8_unicode_ci"
  }
);

//add hotlink associations
Article.hasMany(Hotlink, {
  sourceKey: 'url',
  foreignKey: 'url'
});

Hotlink.belongsTo(Article, {
  foreignKey: 'url', 
  targetKey: 'url', 
  constraints: false
});

module.exports = Article;
