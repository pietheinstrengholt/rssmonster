import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import { Article } from './article.js';

export const Tag = sequelize.define(
  "tags",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    articleId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    userId: {
      type: Sequelize.INTEGER,
      autoIncrement: false,
      allowNull: false,
    },
    name: {
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

// Associations: Article 1..* Tag (direct foreign key)
Tag.belongsTo(Article, { foreignKey: 'articleId' });
Article.hasMany(Tag, { foreignKey: 'articleId' });

export default Tag;