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
        type: DataTypes.STRING.BINARY,
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
      // Sets automatic crawling: null is adaptive, zero disables it, and positive values override the base cadence.
      updateIntervalMinutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        validate: { min: 0 }
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
      // Mirrors the latest attempt for legacy clients; nextFetchAt governs scheduling.
      lastFetched: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Stores the latest HTTP entity tag accepted from the feed origin.
      etag: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        defaultValue: null,
        validate: { len: [0, 2048] }
      },
      // Stores the latest Last-Modified validator accepted from the feed origin.
      lastModified: {
        type: DataTypes.STRING(1024),
        allowNull: true,
        defaultValue: null,
        validate: { len: [0, 1024] }
      },
      // Stores the decoded response hash used to detect unchanged feed content.
      contentHash: {
        type: DataTypes.STRING(128),
        allowNull: true,
        defaultValue: null,
        validate: { len: [0, 128] }
      },
      // Records how long HTTP cache metadata allows the current feed response to remain fresh.
      cacheFreshUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records the latest acquisition attempt regardless of its outcome.
      lastAttemptAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records the latest successful changed, unchanged, or not-modified response.
      lastSuccessAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records when decoded feed content most recently changed.
      lastChangedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records the newest publisher timestamp observed in a successful feed.
      lastPublishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Stores bounded EWMA cadence from newly accepted publisher timestamps.
      observedEntryIntervalMs: {
        type: DataTypes.BIGINT,
        allowNull: true,
        defaultValue: null,
        validate: { min: 0 }
      },
      // Counts consecutive acquisition failures and resets on every successful response.
      consecutiveFailures: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 }
      },
      // Governs automatic scheduling; null suppresses disabled or quarantined feeds.
      nextFetchAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW
      },
      // Records the exclusive claim deadline for one crawl worker.
      leaseUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Identifies the worker allowed to complete or release the current claim.
      leaseOwner: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null,
        validate: { len: [0, 64] }
      },
      // Stores the latest neutral feed-fetch outcome for scheduling and diagnostics.
      lastFetchOutcome: {
        type: DataTypes.STRING(64),
        allowNull: true,
        defaultValue: null,
        validate: {
          isIn: [[
            'changed',
            'unchanged',
            'not_modified',
            'rate_limited',
            'transient_failure',
            'permanent_failure',
            'malformed',
            'security_rejected',
            'too_large',
            'timed_out'
          ]],
          len: [0, 64]
        }
      },
      // Preserves the latest publisher-declared canonical feed URL for validation history.
      publisherSelfUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        validate: { len: [0, 8192] }
      },
      // Records whether the latest publisher self declaration was accepted or rejected.
      publisherSelfStatus: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: null,
        validate: {
          isIn: [[
            'validated',
            'known_alias',
            'invalid',
            'security_rejected',
            'unreachable',
            'malformed',
            'unrelated'
          ]],
          len: [0, 32]
        }
      },
      // Records when RSSMonster most recently evaluated the publisher self declaration.
      publisherSelfCheckedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Stores a bounded operational explanation for rejected self declarations.
      publisherSelfDiagnostic: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        validate: { len: [0, 4096] }
      }
    },
    {
      hooks: {
        // Keeps disabled feeds outside the due-feed index regardless of their prior deadline.
        beforeValidate: feed => {
          if (
            feed.updateIntervalMinutes !== null &&
            Number(feed.updateIntervalMinutes) === 0
          ) {
            feed.nextFetchAt = null;
          }
        }
      },
      indexes: [
        { fields: ['userId'] },
        { fields: ['categoryId'] },
        { name: 'feeds_due_claim_idx', fields: ['status', 'nextFetchAt', 'leaseUntil', 'id'] },
        { name: 'feeds_user_due_claim_idx', fields: ['userId', 'status', 'nextFetchAt', 'leaseUntil', 'id'] },
        { name: 'feeds_lease_owner_idx', fields: ['leaseOwner'] },
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
