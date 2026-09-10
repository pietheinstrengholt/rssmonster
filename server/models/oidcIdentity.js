import { DataTypes } from 'sequelize';

export default sequelize => sequelize.define('oidc_identities', {
  // Hashing the exact issuer/subject pair avoids case-insensitive database collations.
  identityHash: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
  issuer: { type: DataTypes.TEXT, allowNull: false },
  subject: { type: DataTypes.TEXT, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  indexes: [{ fields: ['userId'] }],
  charset: 'utf8mb4',
  collate: 'utf8mb4_unicode_ci'
});
