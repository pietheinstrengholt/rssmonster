import { DataTypes } from 'sequelize';

// Defines one browser push endpoint owned by an RSSMonster user.
export default sequelize => sequelize.define('push_subscriptions', {
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
  endpoint: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { len: [1, 4096], isUrl: true }
  },
  endpointHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    validate: { len: [64, 64], is: /^[0-9a-f]{64}$/ }
  },
  p256dh: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { len: [1, 1024] }
  },
  auth: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { len: [1, 1024] }
  },
  expirationTime: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  indexes: [
    { name: 'push_subscriptions_endpoint_hash_unique', unique: true, fields: ['endpointHash'] },
    { name: 'push_subscriptions_userId_idx', fields: ['userId'] }
  ],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
