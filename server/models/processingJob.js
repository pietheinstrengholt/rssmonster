import { DataTypes } from 'sequelize';

export const PROCESSING_JOB_STATUSES = Object.freeze([
  'pending',
  'running',
  'succeeded',
  'dead',
  'cancelled'
]);

// Defines one durable, retryable unit of background processing work.
export default sequelize => sequelize.define('processing_jobs', {
  id: {
    type: DataTypes.UUID,
    allowNull: false,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  type: { type: DataTypes.STRING(64), allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  articleId: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  dedupeKey: { type: DataTypes.STRING(255), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM(...PROCESSING_JOB_STATUSES),
    allowNull: false,
    defaultValue: 'pending'
  },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
  availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  leaseOwner: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
  leaseUntil: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  lastErrorCode: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
  lastErrorMessage: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
  startedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
}, {
  indexes: [
    {
      name: 'processing_jobs_user_type_dedupe_unique',
      unique: true,
      fields: ['userId', 'type', 'dedupeKey']
    },
    {
      name: 'processing_jobs_claim_idx',
      fields: ['status', 'priority', 'createdAt', 'availableAt', 'id']
    },
    {
      name: 'processing_jobs_lease_recovery_idx',
      fields: ['status', 'leaseUntil', 'id']
    },
    {
      name: 'processing_jobs_user_status_available_idx',
      fields: ['userId', 'status', 'availableAt']
    },
    {
      name: 'processing_jobs_user_article_status_idx',
      fields: ['userId', 'articleId', 'status']
    }
  ],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
