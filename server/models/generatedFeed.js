import { DataTypes } from 'sequelize';

// Defines one externally consumable, expression-backed RSS feed owned by a user.
export default sequelize => sequelize.define(
  'GeneratedFeed',
  {
    // Provides the stable identifier used by authenticated management APIs.
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    // Identifies the user whose articles may appear in this Generated Feed.
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Stores the user-facing Generated Feed name.
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { len: [1, 255] }
    },
    // Stores optional supporting text shown in Generated Feed settings.
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    // Stores the article-search expression executed through the Smart Folder query engine.
    expression: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { len: [1, 4096] }
    },
    // Provides the opaque bearer secret used by external RSS clients.
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: {
        len: [43, 64],
        is: /^[A-Za-z0-9_-]+$/
      }
    },
    // Allows external access to be suspended without deleting the configuration.
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    // Records when the current token became active, including initial creation.
    tokenRegeneratedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'generated_feeds',
    indexes: [
      {
        name: 'generated_feeds_userId_idx',
        fields: ['userId']
      },
      {
        name: 'generated_feeds_token_unique',
        unique: true,
        fields: ['token']
      }
    ],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
);
