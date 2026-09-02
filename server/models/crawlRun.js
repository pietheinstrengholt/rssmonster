import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const CrawlRun = sequelize.define(
    'crawl_runs',
    {
      // Provides the stable identifier for this crawl execution.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the user whose feeds are processed by this crawl run.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Tracks whether the crawl is running, completed, or failed.
      status: {
        type: DataTypes.ENUM('running', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'running'
      },
      // Records when crawl processing began, defaulting to creation time.
      startedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      // Records when crawl processing ended; null while the run remains active.
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records the most recent durable liveness signal from the owning worker.
      heartbeatAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Fences heartbeat and terminal writes to the worker that created the run.
      ownerToken: {
        type: DataTypes.STRING(36),
        allowNull: true,
        defaultValue: null
      },
      // Stores the run-level failure message; null when no fatal error occurred.
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      // Counts articles newly persisted by the run; null when metrics were not recorded.
      newArticles: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts existing articles revised by the run; null when metrics were not recorded.
      updatedArticles: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts entry-level processing errors across feeds; null when metrics were not recorded.
      articleErrors: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts feed-level or run-level errors; null when metrics were not recorded.
      errors: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Stores the run's elapsed processing time in milliseconds; null until measured.
      durationMs: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts feeds completed without a feed-level failure; null when metrics were not recorded.
      processedFeeds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts feeds that ended with a fetch or processing failure; null when metrics were not recorded.
      failedFeeds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts feeds whose processing exceeded the timeout; null when metrics were not recorded.
      timedOutFeeds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Counts feeds for which a final result was persisted.
      feedsAttempted: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Counts feeds that succeeded without endpoint recovery.
      feedsSucceeded: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Counts feeds that succeeded through endpoint recovery.
      feedsRecovered: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Counts entries fetched across final feed results.
      articlesFetched: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Counts entries rejected by configured filtering before visible persistence.
      articlesFiltered: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Counts entries known to require no article change.
      articlesUnchanged: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Counts entries suppressed as duplicates.
      articlesDuplicate: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
      // Records whether the run was scheduled or started through the API; null when unknown.
      triggerType: {
        type: DataTypes.ENUM('scheduled', 'api'),
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
          name: 'crawl_runs_status_heartbeatAt_idx',
          fields: ['status', 'heartbeatAt']
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
