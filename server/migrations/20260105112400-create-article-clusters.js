'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable(
      'article_clusters',
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          allowNull: false,
          primaryKey: true
        },

        // Representative article for this cluster
        representativeArticleId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'articles',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },

        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },

        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
      }
    );

    // Optional but useful index
    await queryInterface.addIndex(
      'article_clusters',
      ['representativeArticleId'],
      {
        name: 'article_clusters_rep_article_idx'
      }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      'article_clusters',
      'article_clusters_rep_article_idx'
    );

    await queryInterface.dropTable('article_clusters');
  }
};