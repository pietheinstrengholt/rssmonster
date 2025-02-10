'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(
      "article_tags",
      {
      // It is possible to create foreign keys:
      articleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // This is a reference to another model
          model: "articles",

          // This is the column name of the referenced model
          key: "id"
        }
      },
      // It is possible to create foreign keys:
      tagId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // This is a reference to another model
          model: "tags",

          // This is the column name of the referenced model
          key: "id"
        }
      },
        createdAt: {
          type: Sequelize.DATE
        },
      },
      {
        charset: "utf8mb4",
        collate: "utf8mb4_unicode_ci"
      }
    );
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable("article_tags");
  }
};
