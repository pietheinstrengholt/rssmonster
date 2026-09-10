import { isLocalAuthEnabled } from '../config/auth.js';
import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const User = sequelize.define(
    'users',
    {
      // Provides the stable identifier used to own user-scoped RSSMonster data.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Stores the unique account name used to sign in.
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      // Stores the optional normalized address used for account and delivery email.
      email: {
        type: DataTypes.STRING(320),
        allowNull: true,
        defaultValue: null,
        validate: {
          isEmail: true
        }
      },
      // Records when the current email address was confirmed by its owner.
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Records the credential boundary used to invalidate sessions after password changes.
      passwordChangedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      // Stores the local password hash, or null for an OIDC-only account.
      password: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          notEmpty: true
        }
      },
      // Stores the protected Fever credential, or null when local credentials are absent.
      feverCredentialHash: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      // Determines the account's authorization role, defaulting to a standard user.
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'user'
      },
      // Serializes the one-time first-user administrator assignment in the database.
      bootstrapAdminClaim: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: null,
        unique: true
      },
      // Records the most recent successful login time, initially set when the account is created.
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      indexes: [
        {
          name: 'users_email_unique',
          unique: true,
          fields: ['email']
        }
      ],
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  // This function prevents stored credentials from being serialized in API responses.
  User.prototype.toJSON = function toJSON() {
    const values = { ...this.get({ plain: true }) };
    if (Object.hasOwn(values, 'password')) values.localPasswordEnabled = isLocalAuthEnabled() && Boolean(values.password);
    else if (Object.hasOwn(values, 'localPasswordEnabled')) values.localPasswordEnabled = isLocalAuthEnabled() && Boolean(values.localPasswordEnabled);
    delete values.password;
    delete values.feverCredentialHash;
    delete values.bootstrapAdminClaim;
    return values;
  };

  return User;
};
