import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Topic = sequelize.define(
    'topics',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      topicKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      topicVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      topicType: {
        type: DataTypes.ENUM('event', 'behavioral', 'hybrid'),
        allowNull: false,
        defaultValue: 'event'
      },
      affinityScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      evidenceScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      articleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      behavioralArticleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      eventCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      starredCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      lastActivityAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastBehaviorAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        { fields: ['userId', 'topicType'] },
        { fields: ['topicKey'] },
        { fields: ['affinityScore'] }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Topic;
};
