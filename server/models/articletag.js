import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';

export const ArticleTag = sequelize.define(
  "article_tags",
  {
    articleId: {
      type: Sequelize.STRING,
      allowNull: false
    },
    tagId: {
      type: Sequelize.STRING,
      allowNull: false
    }
  },
  {
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

export default ArticleTag;