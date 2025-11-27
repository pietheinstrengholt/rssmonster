'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tags', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      articleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'articles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    });

    // Helpful indexes for fast lookups and deduping per article/user
    await queryInterface.addIndex('tags', ['articleId', 'name'], {
      name: 'tags_articleId_name_idx',
      unique: false
    });
    await queryInterface.addIndex('tags', ['userId', 'name'], {
      name: 'tags_userId_name_idx',
      unique: false
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('tags', 'tags_articleId_name_idx');
    await queryInterface.removeIndex('tags', 'tags_userId_name_idx');
    await queryInterface.dropTable('tags');
  }
};
