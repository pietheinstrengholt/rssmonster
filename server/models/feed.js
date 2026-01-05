import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import { Article } from './article.js';

export const Feed = sequelize.define(
  'feeds',
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
    feedName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    feedDesc: {
      type: Sequelize.TEXT
    },
    feedType: {
      type: Sequelize.STRING(16),
      allowNull: true
    },
    url: {
      type: Sequelize.STRING
    },
    rssUrl: {
      type: Sequelize.STRING
    },
    favicon: {
      type: Sequelize.STRING
    },
    errorCount: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    },
    errorMessage: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    status: {
      type: Sequelize.ENUM('active', 'error', 'disabled'),
      allowNull: false,
      defaultValue: 'active'
    },
    lastFetched: {
      type: Sequelize.DATE,
      allowNull: true
    }
  },
  {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
);

// associations
Feed.hasMany(Article, { foreignKey: 'feedId' });
Article.belongsTo(Feed, { foreignKey: 'feedId' });

export default Feed;
