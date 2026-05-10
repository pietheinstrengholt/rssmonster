import { DataTypes } from 'sequelize';
import { averageVectors, resolveArticleVector } from '../util/vectorMath.js';

const MAX_INTEREST_ARTICLES = 20;

function toTimestamp(value) {
  if (!value) return 0;

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();

  return Number.isFinite(time) ? time : 0;
}

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
      },
      interestVector: {
        type: DataTypes.VIRTUAL(DataTypes.JSON),
        get() {
          const relatedArticles =
            this.get('articles') ??
            this.get('Articles') ??
            [];

          if (!Array.isArray(relatedArticles) || !relatedArticles.length) {
            return null;
          }

          const selectedVectors = relatedArticles
            .filter(article => Number(article?.starInd) === 1)
            .sort((a, b) => {
              const leftTime = toTimestamp(
                a?.updatedAt ?? a?.published ?? a?.createdAt
              );
              const rightTime = toTimestamp(
                b?.updatedAt ?? b?.published ?? b?.createdAt
              );

              return rightTime - leftTime;
            })
            .slice(0, MAX_INTEREST_ARTICLES)
            .map(resolveArticleVector)
            .filter(Boolean);

          return averageVectors(selectedVectors);
        }
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