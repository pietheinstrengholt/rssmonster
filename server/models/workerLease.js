import { DataTypes } from 'sequelize';

// Defines one renewable cross-process coordination lease.
export default sequelize => sequelize.define('worker_leases', {
  key: {
    type: DataTypes.STRING(64),
    allowNull: false,
    primaryKey: true
  },
  owner: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  leaseUntil: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  indexes: [{ name: 'worker_leases_expiry_idx', fields: ['leaseUntil'] }],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
