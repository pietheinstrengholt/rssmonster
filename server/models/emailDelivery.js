import { DataTypes } from 'sequelize';

export const EMAIL_DELIVERY_STATUSES = Object.freeze([
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled'
]);

// Creates one durable, deduplicated email delivery owned by a user.
export default sequelize => {
  const EmailDelivery = sequelize.define('email_deliveries', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    messageType: { type: DataTypes.STRING(64), allowNull: false },
    recipient: {
      type: DataTypes.STRING(320),
      allowNull: false,
      validate: { isEmail: true }
    },
    status: {
      type: DataTypes.ENUM(...EMAIL_DELIVERY_STATUSES),
      allowNull: false,
      defaultValue: 'pending'
    },
    payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    retryCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    scheduledAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    leaseOwner: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    leaseUntil: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    providerMessageId: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
    lastError: { type: DataTypes.STRING(2000), allowNull: true, defaultValue: null },
    dedupeKey: { type: DataTypes.STRING(255), allowNull: false }
  }, {
    indexes: [
      {
        name: 'email_deliveries_user_type_dedupe_unique',
        unique: true,
        fields: ['userId', 'messageType', 'dedupeKey']
      },
      {
        name: 'email_deliveries_claim_idx',
        fields: ['status', 'availableAt', 'leaseUntil', 'id']
      },
      {
        name: 'email_deliveries_user_status_idx',
        fields: ['userId', 'status', 'scheduledAt']
      }
    ],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  });

  // Prevents persisted message bodies and embedded action links from entering API responses.
  EmailDelivery.prototype.toJSON = function toJSON() {
    const values = { ...this.get({ plain: true }) };
    delete values.payload;
    return values;
  };

  return EmailDelivery;
};
