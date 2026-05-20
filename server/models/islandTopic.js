import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const IslandTopic = sequelize.define(
    'island_topics',
    {
      islandId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        primaryKey: true
      },
      topicId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true
      },
      similarity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
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
