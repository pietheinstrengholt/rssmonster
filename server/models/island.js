import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Island = sequelize.define(
    'islands',
    {
      // Provides the stable identifier for this user interest island.
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Stores the human-readable interest label presented to the user.
      label: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      // Measures the island's relative behavioral strength, defaulting to no weight.
      weight: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Identifies the user whose engagement signals define this island.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the aggregate embedding representing the island; null before calibration.
      islandVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      // Marks whether the island is excluded from active interest scoring.
      archivedInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Records when the island was archived; null while it remains active.
      archivedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Aggregates the positive engagement signals that support the island.
      positiveSignals: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
          stars: 0,
          clicks: 0,
          deepReads: 0
        }
      },
      // Stores calibration history used to explain how the island population changed.
      populationAudit: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        { fields: ['userId', 'weight'] },
        { fields: ['userId', 'archivedInd'] }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Island;
};
