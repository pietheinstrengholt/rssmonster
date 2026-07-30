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
      // Stores the hashed password used for account authentication.
      password: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      // Stores the protected credential used to authenticate Fever API requests.
      feverCredentialHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      // Determines the account's authorization role, defaulting to a standard user.
      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'user'
      },
      // Records the most recent successful login time, initially set when the account is created.
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  // This function prevents stored credentials from being serialized in API responses.
  User.prototype.toJSON = function toJSON() {
    const values = { ...this.get({ plain: true }) };
    delete values.password;
    delete values.feverCredentialHash;
    return values;
  };

  return User;
};
