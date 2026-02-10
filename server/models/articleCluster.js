// models/articleCluster.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const ArticleCluster = sequelize.define(
    'article_clusters',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      representativeArticleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      articleCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },

      /**
       * Cluster confidence strength (0.0 – 1.0)
       * Derived, idempotent, improves over time.
       */
      clusterStrength: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.0
      },
      eventVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      topicVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      /**
       * Stable topic hash (groups related events)
       */
      topicKey: {
        type: DataTypes.STRING(64),
        allowNull: true
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return ArticleCluster;
};