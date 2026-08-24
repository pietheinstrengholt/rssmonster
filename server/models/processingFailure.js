import { DataTypes } from 'sequelize';

export const PROCESSING_FAILURE_TYPES = Object.freeze([
  'ERROR',
  'TIMEOUT',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'INVALID_DATA',
  'PERSISTENCE_FAILURE',
  'LEASE_LOST',
  'ABANDONED',
  'CANCELLED'
]);

export const PROCESSING_FAILURE_SEVERITIES = Object.freeze([
  'WARNING',
  'ERROR',
  'FATAL'
]);

// Defines one append-only abnormal processing outcome.
export default (sequelize) => sequelize.define('processing_failures', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  crawlRunId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  executionId: {
    type: DataTypes.UUID,
    allowNull: false,
    defaultValue: DataTypes.UUIDV4
  },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  stage: { type: DataTypes.STRING(64), allowNull: false },
  failureType: {
    type: DataTypes.ENUM(...PROCESSING_FAILURE_TYPES),
    allowNull: false,
    defaultValue: 'ERROR'
  },
  severity: {
    type: DataTypes.ENUM(...PROCESSING_FAILURE_SEVERITIES),
    allowNull: false,
    defaultValue: 'ERROR'
  },
  code: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
  errorName: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
  message: { type: DataTypes.STRING(2000), allowNull: false },
  stackTrace: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  subjectType: { type: DataTypes.STRING(32), allowNull: true, defaultValue: null },
  subjectId: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
  feedId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  articleId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  retryable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  attemptNumber: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  context: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
  occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  indexes: [
    { name: 'processing_failures_user_occurred_idx', fields: ['userId', 'occurredAt'] },
    { name: 'processing_failures_crawl_occurred_idx', fields: ['crawlRunId', 'occurredAt'] },
    { name: 'processing_failures_user_stage_occurred_idx', fields: ['userId', 'stage', 'occurredAt'] },
    { name: 'processing_failures_user_type_occurred_idx', fields: ['userId', 'failureType', 'occurredAt'] },
    { name: 'processing_failures_fingerprint_occurred_idx', fields: ['fingerprint', 'occurredAt'] },
    { name: 'processing_failures_feed_occurred_idx', fields: ['feedId', 'occurredAt'] }
  ],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
