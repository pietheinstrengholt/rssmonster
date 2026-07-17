import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const CrawlRun = sequelize.define(
    'crawl_runs',
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
      status: {
        type: DataTypes.ENUM('running', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'running'
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      newArticles: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      updatedArticles: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      articleErrors: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      errors: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      durationMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        {
          name: 'crawl_runs_userId_startedAt_idx',
          fields: ['userId', 'startedAt']
        },
        {
          name: 'crawl_runs_active_user_unique',
          unique: true,
          fields: [
            sequelize.literal("(CASE WHEN `status` = 'running' THEN `userId` ELSE NULL END)")
          ]
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return CrawlRun;
};
