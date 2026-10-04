import { DataTypes } from 'sequelize';

// Stores one deterministic rule condition for a webhook.
export default sequelize => sequelize.define('WebhookCondition', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true
  },
  webhookId: { type: DataTypes.INTEGER, allowNull: false },
  field: {
    type: DataTypes.STRING(64),
    allowNull: false,
    validate: { notEmpty: true }
  },
  operator: {
    type: DataTypes.STRING(32),
    allowNull: false,
    validate: { notEmpty: true }
  },
  value: { type: DataTypes.TEXT, allowNull: false }
}, {
  tableName: 'webhook_conditions',
  indexes: [{ name: 'webhook_conditions_webhookId_idx', fields: ['webhookId'] }],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
