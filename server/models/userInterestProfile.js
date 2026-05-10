import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const UserInterestProfile = sequelize.define(
    'userInterestProfiles',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      topicKey: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      vector: {
        type: DataTypes.JSON,
        allowNull: false
      },
      weight: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0
      },
      interactionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastSeen: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      timestamps: false,
      indexes: [
        { fields: ['userId', 'weight'] },
        { fields: ['userId', 'lastSeen'] },
        { fields: ['userId', 'topicKey'] }
      ]
    }
  );

  return UserInterestProfile;
};