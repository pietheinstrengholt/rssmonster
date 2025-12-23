'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('articles', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          // This is a reference to another model
          model: "users",

          // This is the column name of the referenced model
          key: "id"
        }
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
      clickedInd: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      hotlinks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      url: {
        type: Sequelize.TEXT('medium'),
        allowNull: false
      },
      imageUrl: Sequelize.TEXT,
      title: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      author: Sequelize.TEXT,
      description: Sequelize.TEXT,
      content: Sequelize.TEXT('medium'),
      contentStripped: Sequelize.TEXT,
      language: Sequelize.TEXT('tiny'),
      advertisementScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      sentimentScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50
      },
      qualityScore: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 50
      },
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

    // Indexes to optimize common queries
    await queryInterface.addIndex('articles', ['feedId'], { name: 'articles_feedId_idx' });
    await queryInterface.addIndex('articles', ['status'], { name: 'articles_status_idx' });
    await queryInterface.addIndex('articles', ['starInd'], { name: 'articles_starInd_idx' });
    await queryInterface.addIndex('articles', ['userId'], { name: 'articles_userId_idx' });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex('articles', 'articles_feedId_idx');
    await queryInterface.removeIndex('articles', 'articles_status_idx');
    await queryInterface.removeIndex('articles', 'articles_starInd_idx');
    await queryInterface.removeIndex('articles', 'articles_userId_idx');
    await queryInterface.dropTable('articles');
  }
};