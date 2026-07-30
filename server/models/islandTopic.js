import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const IslandTopic = sequelize.define(
    'island_topics',
    {
      // Identifies the interest island participating in this topic membership.
      islandId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the topic participating in this interest-island membership.
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true
      },
      // Records the semantic affinity between the island and topic vectors.
      similarity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Records the evidence-adjusted confidence in the island-to-topic membership.
      confidence: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      indexes: [
        { fields: ['topicId'] },
        { fields: ['islandId', 'confidence'] }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return IslandTopic;
};
