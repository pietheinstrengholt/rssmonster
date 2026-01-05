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

        // Human-readable cluster name
        name: {
          type: Sequelize.STRING(255),
          allowNull: true
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

    // Index for fast lookup of representative
    await queryInterface.addIndex(
      'article_clusters',
      ['representativeArticleId'],
      {
        name: 'article_clusters_rep_article_idx'
      }
    );

    // Optional but useful: index for sorting / searching clusters
    await queryInterface.addIndex(
      'article_clusters',
      ['name'],
      {
        name: 'article_clusters_name_idx'
      }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      'article_clusters',
      'article_clusters_name_idx'
    );

    await queryInterface.removeIndex(
      'article_clusters',
      'article_clusters_rep_article_idx'
    );

    // ENUM must be explicitly dropped in MySQL
    await queryInterface.dropTable('article_clusters');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS enum_article_clusters_nameSource;'
    );
  }
};