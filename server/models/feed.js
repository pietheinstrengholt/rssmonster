import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Feed = sequelize.define(
    'feeds',
    {
      // Provides the stable identifier for this subscribed feed.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the user who owns this feed subscription.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Identifies the category that organizes this feed for its owner.
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      // Stores the feed name shown in navigation and article metadata.
      feedName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      // Stores the publisher-provided feed description; null when unavailable.
      feedDesc: {
        type: DataTypes.TEXT
      },
      // Records the detected feed format; null when the format is not recorded.
      feedType: {
        type: DataTypes.STRING(16),
        allowNull: true
      },
      // Stores the subscription URL fetched for new entries.
      url: {
        type: DataTypes.STRING,
        allowNull: false
      },
      // Stores the feed icon URL shown by clients; null when none is available.
      favicon: {
        type: DataTypes.STRING
      },
      // Counts consecutive fetch failures, resetting after a successful crawl.
      errorCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      // Stores the latest fetch failure message; null when no current error is recorded.
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      // Records when the current sequence of fetch failures began; null when healthy.
      errorSince: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Defers crawling until this time; null when the feed is not muted.
      mutedUntil: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Tracks whether crawling is active, failing, or administratively disabled.
      status: {
        type: DataTypes.ENUM('active', 'error', 'disabled'),
        allowNull: false,
        defaultValue: 'active'
      },

      /**
       * Feed quality & trust
       */
      // Scores the feed's observed trustworthiness for article quality adjustment.
      feedTrust: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.5
      },
      // Stores the observed proportion of feed articles identified as duplicates.
      feedDuplicationRate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      /**
       * Feed-level reading behavior statistics
       * Used for predicting readingAffinity of new, unread articles
       */
      // Stores the average reader attention score observed for this feed.
      feedAttentionAvg: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Stores the proportion of sampled feed articles that received a deep read.
      feedDeepReadRatio: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Stores the proportion of sampled feed articles that were skimmed.
      feedSkimRatio: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Stores the proportion of sampled feed articles that were ignored.
      feedIgnoreRatio: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Stores the average outbound-click count across sampled feed articles.
      feedClickAvg: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Stores the proportion of sampled feed articles receiving an outbound click.
      feedClickRatio: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      // Counts the articles supporting the feed-level attention statistics.
      feedAttentionSampleSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Records when feed-level attention statistics were last recalculated; null before calibration.
      feedAttentionUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },

      /**
       * Feed-specific update controls
       */
      // Overrides the feed's crawl cadence in minutes; null uses the global schedule.
      updateIntervalMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null
      },
      // Stores tags automatically applied to newly saved articles from this feed.
      feedTags: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: []
      },
      // Controls whether newly crawled articles receive semantic embeddings.
      generateEmbeddings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Controls whether newly crawled articles receive AI content scoring and summaries.
      applyAiAnalysis: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      // Ignores feed entries older than this cutoff; null applies no feed-specific cutoff.
      crawlSince: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records the latest fetch attempt for crawl scheduling; null before the first attempt.
      lastFetched: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      indexes: [
        { fields: ['userId'] },
        { fields: ['categoryId'] },
        {
          unique: true,
          fields: ['userId', 'url']
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Feed;
};
