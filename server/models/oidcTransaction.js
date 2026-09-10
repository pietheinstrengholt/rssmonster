import { DataTypes } from 'sequelize';

// Shared storage makes callback and handoff consumption atomic across server instances.
export default sequelize => sequelize.define('oidc_transactions', {
  stateHash: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
  browserHash: { type: DataTypes.STRING(64), allowNull: false },
  configurationHash: { type: DataTypes.STRING(64), allowNull: false },
  nonce: { type: DataTypes.STRING(64), allowNull: true },
  codeVerifier: { type: DataTypes.STRING(128), allowNull: true },
  phase: { type: DataTypes.STRING(16), allowNull: false },
  linkUserId: { type: DataTypes.INTEGER, allowNull: true },
  userId: { type: DataTypes.INTEGER, allowNull: true },
  passwordVersion: { type: DataTypes.STRING(32), allowNull: true },
  exchangeHash: { type: DataTypes.STRING(64), allowNull: true, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
}, {
  indexes: [{ fields: ['expiresAt'] }],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
