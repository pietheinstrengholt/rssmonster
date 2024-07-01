'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('articles', {
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
          model: "feeds",

          // This is the column name of the referenced model
          key: "id"
        }
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "unread"
      },
      starInd: Sequelize.INTEGER,
      hotlinks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      url: {
        type: Sequelize.TEXT('medium'),
        allowNull: false
      },
      imageUrl: Sequelize.TEXT('medium'),
      subject: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      content: Sequelize.TEXT('medium'),
      contentStripped: Sequelize.TEXT('medium'),
      language: Sequelize.TEXT('tiny'),
      published: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      createdAt: {
        type: Sequelize.DATE
      },
      updatedAt: {
        type: Sequelize.DATE
      }
    }, {
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci"
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('articles');
  }
};