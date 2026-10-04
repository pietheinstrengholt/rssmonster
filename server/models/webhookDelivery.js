import { DataTypes } from 'sequelize';

export const WEBHOOK_DELIVERY_STATUSES = Object.freeze(['pending', 'success', 'failed']);

// Tracks one logical delivery for a webhook and article.
export default sequelize => sequelize.define('WebhookDelivery', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  webhookId: { type: DataTypes.INTEGER, allowNull: false },
  articleId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM(...WEBHOOK_DELIVERY_STATUSES),
    allowNull: false,
    defaultValue: 'pending'
  },
  attemptCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 }
  },
  lastAttemptAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
  httpStatus: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
  error: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null }
}, {
  tableName: 'webhook_deliveries',
  indexes: [
    {
      name: 'webhook_deliveries_webhook_article_unique',
      unique: true,
      fields: ['webhookId', 'articleId']
    },
    { name: 'webhook_deliveries_articleId_idx', fields: ['articleId'] },
    {
      name: 'webhook_deliveries_status_nextAttemptAt_idx',
      fields: ['status', 'nextAttemptAt', 'id']
    }
  ],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
