import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Event = sequelize.define(
    'events',
    {
      // Provides the stable identifier for this evolving group of related articles.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      // Identifies the user who owns this event and its member articles.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Links to the event's primary topic for efficient grouping; null before topic assignment.
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      // Identifies the event's representative article used for display and summarization.
      representativeArticleId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the current developing-story article; null until one is selected.
      developingArticleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Stores the event title shown in the UI; null until a name is generated.
      name: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      // Caches the number of articles grouped into the event, starting with its representative.
      articleCount: {
        type: DataTypes.INTEGER,
        defaultValue: 1
      },
      // Caches the number of distinct source feeds represented in the event.
      sourceCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Measures how broadly the event is corroborated across distinct sources.
      sourceDiversityScore: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      // Scores the event's overall significance from its membership and source evidence.
      eventStrength: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      // Stores the aggregate embedding representing the event; null before vectorization.
      eventVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Records the earliest member-article event time; null before the window is derived.
      eventWindowStartAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Records the latest member-article event time; null before the window is derived.
      eventWindowEndAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Tracks the event lifecycle as emerging, active, cooling, or archived.
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
