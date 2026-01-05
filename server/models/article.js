import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import cache from '../util/cache.js';
import ArticleCluster from './articleCluster.js';

const TAU_HOURS = 48; // tune this globally

export const Article = sequelize.define(
  "articles",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    feedId: {
      type: Sequelize.INTEGER,
      allowNull: false
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
    clickedInd: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    media: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
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
    title: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    author: Sequelize.TEXT,
    description: Sequelize.TEXT,
    contentOriginal: Sequelize.TEXT("medium"),
    contentStripped: Sequelize.TEXT,
    contentSummaryBullets: {
      type: Sequelize.JSON,
      allowNull: true
    },
    contentHash: {
      type: Sequelize.STRING(64),
      allowNull: true
    },
    vector: {
      type: Sequelize.JSON,
      allowNull: true
    },
    embedding_model: {
      type: Sequelize.STRING(64),
      allowNull: true
    },
    clusterId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    language: Sequelize.TEXT("tiny"),
    advertisementScore: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    sentimentScore: {
      type: Sequelize.INTEGER,
      defaultValue: 50
    },
    qualityScore: {
      type: Sequelize.INTEGER,
      defaultValue: 50
    },
    freshness: {
      type: Sequelize.VIRTUAL(Sequelize.FLOAT),
      get() {
        const published = this.getDataValue('published');
        if (!published) return 0;

        const ageMs = Date.now() - new Date(published).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);

        return Math.exp(-ageHours / TAU_HOURS);
      }
    },
    quality: {
      type: Sequelize.VIRTUAL(Sequelize.FLOAT),
      get() {
        const advertisementScore = this.getDataValue('advertisementScore') ?? 0;
        const sentimentScore = this.getDataValue('sentimentScore') ?? 50;
        const qualityScore = this.getDataValue('qualityScore') ?? 50;

        // Normalize sentiment: distance from neutral (50)
        const sentimentPenalty = Math.abs(sentimentScore - 50) * 2;

        let quality =
          100
          - 0.4 * advertisementScore
          - 0.3 * sentimentPenalty
          - 0.2 * qualityScore;

        // Clamp to [0, 100]
        quality = Math.max(0, Math.min(100, quality));

        // Normalize to 0–1 if you want ranking-ready output
        return quality / 100;
      }
    },
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

// Article -> Cluster
Article.belongsTo(ArticleCluster, {
  foreignKey: 'clusterId',
  as: 'cluster'
});

// Cluster -> Articles
ArticleCluster.hasMany(Article, {
  foreignKey: 'clusterId',
  as: 'articles'
});

// Representative article
ArticleCluster.belongsTo(Article, {
  foreignKey: 'representativeArticleId',
  as: 'representative'
});

export default Article;