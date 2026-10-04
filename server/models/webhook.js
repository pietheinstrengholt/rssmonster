import { DataTypes } from 'sequelize';
import { encryptSecret } from '../services/secretEncryption.js';

// Defines one user-owned outbound webhook configuration.
export default sequelize => {
  const Webhook = sequelize.define('Webhook', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { len: [1, 255] }
    },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    endpointUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [1, 4096],
        isHttpUrl(value) {
          try {
            if (['http:', 'https:'].includes(new URL(value).protocol)) return;
          } catch {
            // Invalid URLs fail the same validation as unsupported protocols.
          }
          throw new Error('Endpoint must be an HTTP or HTTPS URL');
        }
      }
    },
    secret: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      set(value) {
        this.setDataValue('secret', value == null ? null : encryptSecret(value));
      }
    },
    matchMode: {
      type: DataTypes.ENUM('ALL', 'ANY'),
      allowNull: false,
      defaultValue: 'ALL'
    }
  }, {
    tableName: 'webhooks',
    defaultScope: { attributes: { exclude: ['secret'] } },
    indexes: [{ name: 'webhooks_userId_idx', fields: ['userId'] }],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  });

  // Keep the signing secret out of serialized webhook records.
  Webhook.prototype.toJSON = function toJSON() {
    const values = { ...this.get({ plain: true }) };
    delete values.secret;
    return values;
  };

  return Webhook;
};
