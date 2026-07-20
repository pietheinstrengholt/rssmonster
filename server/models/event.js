import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Event = sequelize.define(
    'events',
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
      topicId: {
        /**
         * Structural topic grouping link.
         * 
         * Events are semantically similar articles grouped under one topic.
         * Multiple events can belong to the same topic (e.g., a news story evolving).
         * 
         * This is the primary structural relationship: Event -> Topic.
         * Articles reference topics denormally for direct access (Article.topicId).
         * 
         * See: services/topics/event/assignEventToTopic.js for topic resolution.
         */
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Representative article for the event, used for display and summarization. Nullable because an event may be created before a representative article is assigned.
      representativeArticleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Human-readable name/title for the event, used in the UI. Nullable because it may be generated after creation.
      name: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      // Denormalized counts and scores for efficient querying and sorting
      articleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      },
      // Count of unique source feeds contributing to the event, used for source diversity and strength calculations
      sourceCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      sourceDiversityScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      eventStrength: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      eventVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Event windowing start, derived from member article event times.
      eventWindowStartAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Event windowing end, used for lifecycle status, recency scoring, and topic activity.
      eventWindowEndAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('emerging', 'active', 'cooling', 'archived'),
        defaultValue: 'emerging'
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        { fields: ['topicId'] },
        { fields: ['status'] }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Event;
};
