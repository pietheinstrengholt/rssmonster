import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const UserClusterAffinity = sequelize.define(
    'userClusterAffinities',
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
      clusterId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      topicKey: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      affinity: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0
      },
      interactionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      starCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clickCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastInteractionAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      timestamps: false,
      indexes: [
        { unique: true, fields: ['userId', 'clusterId'] },
        { fields: ['userId', 'affinity'] },
        { fields: ['userId', 'topicKey'] }
      ]
    }
  );

  return UserClusterAffinity;
};