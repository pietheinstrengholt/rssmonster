import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const User = sequelize.define(
    'users',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      hash: {
        type: DataTypes.STRING,
        allowNull: false
      },
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'user'
      },
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  // Initialize user_stats row when user is created
  User.afterCreate(async (user) => {
    try {
      const UserStats = sequelize.models.UserStats;
      if (UserStats) {
        await UserStats.findOrCreate({
          where: { userId: user.id },
          defaults: {
            totalCount: 0,
            unreadCount: 0,
            readCount: 0,
            starCount: 0,
            hotCount: 0,
            clickedCount: 0
          }
        });
      }
    } catch (err) {
      console.error(`Error initializing user_stats for user ${user.id}:`, err);
    }
  });

  return User;
};