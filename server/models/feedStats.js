import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const FeedStats = sequelize.define(
    'feedStats',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      feedId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        index: true
      },
      articleCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      unreadCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastRefreshed: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      timestamps: false,
      indexes: [
        { fields: ['userId', 'lastRefreshed'] }
      ]
    }
  );

  return FeedStats;
};
