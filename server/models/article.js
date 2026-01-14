import { DataTypes } from 'sequelize';

const TAU_HOURS = 48; // tune this globally

export default (sequelize) => {
  const Article = sequelize.define(
    'articles',
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
      feedId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unread'
      },
      starInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      clickedInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      HotInd: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      media: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      url: {
        type: DataTypes.STRING(1024),
        allowNull: false
      },
      imageUrl: DataTypes.STRING(1024),
      title: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      author: DataTypes.TEXT,
      description: DataTypes.TEXT,
      contentOriginal: DataTypes.TEXT('medium'),
      contentStripped: DataTypes.TEXT,
      contentSummaryBullets: {
        type: DataTypes.JSON,
        allowNull: true
      },
      contentHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      vector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      embedding_model: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      clusterId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      language: DataTypes.TEXT('tiny'),
      advertisementScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      sentimentScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
      qualityScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
      // Freshness score: >0.7 = today, 0.3–0.7 = recent (1–2 days), 0.1–0.3 = aging, <0.1 = stale
      freshness: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          const published = this.getDataValue('published');
          if (!published) return 0;

          const ageMs = Date.now() - new Date(published).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);

          return Math.exp(-ageHours / TAU_HOURS);
        }
      },
      quality: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          const advertisementScore = this.getDataValue('advertisementScore') ?? 0;
          const sentimentScore = this.getDataValue('sentimentScore') ?? 50;
          const qualityScore = this.getDataValue('qualityScore') ?? 50;

          const sentimentPenalty = Math.abs(sentimentScore - 50) * 2;

          let quality =
            100
            - 0.4 * advertisementScore
            - 0.3 * sentimentPenalty
            - 0.2 * qualityScore;

          quality = Math.max(0, Math.min(100, quality));
          return quality / 100;
        }
      },
      uniqueness: {
        type: DataTypes.VIRTUAL(DataTypes.FLOAT),
        get() {
          const cluster = this.get('cluster');

          if (!cluster || !cluster.articleCount || cluster.articleCount <= 1) {
            return 1.0;
          }

          const clusterSize = cluster.articleCount;
          const uniqueness = 1 / Math.log2(clusterSize + 1);

          return Math.max(0, Math.min(1, uniqueness));
        }
      },
      published: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Article;
};