import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';

export const ArticleCluster = sequelize.define(
  'article_clusters',
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    representativeArticleId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING(255),
      allowNull: true
    }
  },
  {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
);

export default ArticleCluster;