import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const ArticleTopic = sequelize.define(
    'article_topics',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      articleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      primaryInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    },
    {
      indexes: [
        { unique: true, fields: ['articleId', 'topicId'] },
        { fields: ['topicId'] },
        { fields: ['articleId', 'primaryInd'] },
        { fields: ['articleId', 'rank'] }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return ArticleTopic;
};
