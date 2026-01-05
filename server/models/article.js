import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import cache from '../util/cache.js';

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

export default Article;