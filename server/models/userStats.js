import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const UserStats = sequelize.define(
    'user_stats',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      totalCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      unreadCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      readCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      starCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      hotCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      clickedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true
    }
  );

  return UserStats;
};
