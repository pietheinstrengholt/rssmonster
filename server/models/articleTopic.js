import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const ArticleTopic = sequelize.define(
    'article_topics',
    {
      // Provides the stable identifier for this article-to-topic assignment.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      // Identifies the article assigned to the topic.
      articleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the topic assigned to the article.
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Records the semantic confidence in this article-to-topic assignment.
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Orders this topic among the article's assignments, with one as the top rank.
      rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      // Marks whether this is the article's primary topic assignment.
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
