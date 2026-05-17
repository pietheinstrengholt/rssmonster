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
         * See: services/events/assignEventToTopic.js for topic resolution.
         */
        type: DataTypes.INTEGER,
        allowNull: true
      },
      representativeArticleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      articleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      },
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
      firstSeen: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastSeen: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'cooling', 'archived'),
        defaultValue: 'active'
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
