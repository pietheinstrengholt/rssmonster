import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Topic = sequelize.define(
    'topics',
    {
      // Provides the stable identifier for this semantic topic.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      // Identifies the user whose articles and events define this topic.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the human-readable topic name shown to the user.
      name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      // Stores the optional generated topic name used for presentation.
      generatedName: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null
      },
      // Stores the stable semantic identity used to match related topic records.
      topicKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: false
      },
      // Summarizes the topic's subject; null when no description has been generated.
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      // Stores the topic's aggregate embedding; null before semantic representation is available.
      topicVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Classifies the topic as event-derived, behavior-derived, or supported by both.
      topicType: {
        type: DataTypes.ENUM('event', 'behavioral', 'hybrid'),
        allowNull: false,
        defaultValue: 'event'
      },
      // Measures the user's inferred affinity for the topic, defaulting to neutral.
      affinityScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      // Measures the strength of the behavioral evidence supporting the topic.
      evidenceScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      // Caches the total number of articles assigned to the topic.
      articleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Caches the number of behavior-signal articles supporting the topic.
      behavioralArticleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Caches the number of events assigned to the topic.
      eventCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Caches the number of favorited articles supporting the topic.
      starredCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Records the latest article or event activity for the topic; null before activity is recorded.
      lastActivityAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Records the latest behavioral signal for the topic; null before such evidence exists.
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
