import { DataTypes } from 'sequelize';

export const FEED_CRAWL_STATUSES = Object.freeze(['SUCCESS', 'RECOVERED', 'FAILED']);
export const FEED_CRAWL_ERROR_CATEGORIES = Object.freeze([
  'TIMEOUT', 'NOT_FOUND', 'RATE_LIMITED', 'HTTP_ERROR', 'REDIRECT_LOOP',
  'NETWORK_ERROR', 'INVALID_FEED', 'MALFORMED_BODY', 'VALIDATION_ERROR',
  'EMPTY_FEED', 'SECURITY_REJECTED', 'TOO_LARGE', 'UNKNOWN_ERROR'
]);

// Defines the durable final outcome of one feed within one crawl run.
export default (sequelize) => sequelize.define('feed_crawl_results', {
  // Provides the stable identifier for this feed outcome.
  id: { type: DataTypes.INTEGER, autoIncrement: true, allowNull: false, primaryKey: true },
  // Identifies the crawl run that attempted this feed.
  crawlRunId: { type: DataTypes.INTEGER, allowNull: false },
  // Identifies the user who owned the feed at crawl time.
  userId: { type: DataTypes.INTEGER, allowNull: false },
  // Identifies the feed that was attempted.
  feedId: { type: DataTypes.INTEGER, allowNull: false },
  // Records the intentionally small final lifecycle status.
  status: { type: DataTypes.ENUM(...FEED_CRAWL_STATUSES), allowNull: false },
  // Records the normalized terminal failure category.
  errorCategory: { type: DataTypes.ENUM(...FEED_CRAWL_ERROR_CATEGORIES), allowNull: true },
  // Retains a bounded transport or application error code.
  errorCode: { type: DataTypes.STRING(128), allowNull: true },
  // Retains the terminal HTTP response status when available.
  httpStatus: { type: DataTypes.INTEGER, allowNull: true },
  // Stores the URL requested when feed processing began.
  requestedUrl: { type: DataTypes.TEXT, allowNull: false },
  // Stores the final accepted or attempted URL.
  resolvedUrl: { type: DataTypes.TEXT, allowNull: true },
  // Records whether alternate endpoint recovery was attempted.
  recoveryAttempted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Records whether alternate endpoint recovery completed successfully.
  recoverySucceeded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Counts bounded acquisition attempts for this final result.
  attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  // Counts entries supplied by the accepted feed representation.
  itemsFetched: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Counts newly persisted articles.
  articlesNew: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Counts meaningfully revised articles.
  articlesUpdated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Counts entries rejected by configured filtering before visible persistence.
  articlesFiltered: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Counts known publisher entries that required no persistence change.
  articlesUnchanged: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Counts entries suppressed by duplicate detection.
  articlesDuplicate: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Records end-to-end feed processing time in milliseconds.
  durationMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Stores a bounded human-readable terminal diagnostic.
  errorMessage: { type: DataTypes.STRING(1000), allowNull: true },
  // Stores compact bounded acquisition-attempt diagnostics.
  attemptSummary: { type: DataTypes.JSON, allowNull: true },
  // Records when this feed attempt began.
  startedAt: { type: DataTypes.DATE, allowNull: false },
  // Records when this feed attempt reached its final outcome.
  completedAt: { type: DataTypes.DATE, allowNull: false }
}, {
  indexes: [
    { name: 'feed_crawl_results_run_feed_idx', fields: ['crawlRunId', 'feedId'] },
    { name: 'feed_crawl_results_feed_created_idx', fields: ['feedId', 'createdAt'] },
    { name: 'feed_crawl_results_feed_completed_idx', fields: ['feedId', 'completedAt'] },
    { name: 'feed_crawl_results_user_created_idx', fields: ['userId', 'createdAt'] },
    { name: 'feed_crawl_results_run_status_idx', fields: ['crawlRunId', 'status'] },
    { name: 'feed_crawl_results_category_created_idx', fields: ['errorCategory', 'createdAt'] }
  ],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
