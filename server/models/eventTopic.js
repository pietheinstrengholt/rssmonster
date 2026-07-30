import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const EventTopic = sequelize.define(
    'event_topics',
    {
      // Provides the stable identifier for this event-to-topic assignment.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      // Identifies the event assigned to the topic.
      eventId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the topic assigned to the event.
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Records the semantic confidence in this event-to-topic assignment.
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Orders this topic among the event's assignments, with one as the top rank.
      rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      // Marks whether this is the event's primary topic assignment.
      primaryInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    },
    {
      indexes: [
        { unique: true, fields: ['eventId', 'topicId'] },
        { fields: ['topicId'] },
        { fields: ['eventId', 'primaryInd'] },
        { fields: ['eventId', 'rank'] }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return EventTopic;
};
