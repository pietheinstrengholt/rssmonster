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
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return ArticleCluster;
};