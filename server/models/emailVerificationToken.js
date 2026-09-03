import { DataTypes } from 'sequelize';

// Creates the single-use hashed token used to verify one user's email address.
export default sequelize => {
  const EmailVerificationToken = sequelize.define('email_verification_tokens', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: { is: /^[a-f0-9]{64}$/i }
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null }
  }, {
    indexes: [
      {
        name: 'email_verification_tokens_hash_unique',
        unique: true,
        fields: ['tokenHash']
      },
      {
        name: 'email_verification_tokens_user_expiry_idx',
        fields: ['userId', 'expiresAt']
      }
    ],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  });

  // Prevents even hashed verification credentials from entering API responses.
  EmailVerificationToken.prototype.toJSON = function toJSON() {
    const values = { ...this.get({ plain: true }) };
    delete values.tokenHash;
    return values;
  };

  return EmailVerificationToken;
};
