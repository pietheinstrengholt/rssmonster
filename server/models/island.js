import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Island = sequelize.define(
    'islands',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      weight: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      islandVector: {
        type: DataTypes.JSON,
        allowNull: true
      },
      archivedInd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      archivedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      positiveSignals: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {
          stars: 0,
          clicks: 0,
          deepReads: 0
        }
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
