import { DataTypes } from 'sequelize';

export const FEED_URL_ALIAS_TYPES = Object.freeze([
  'input',
  'discovered_alternate',
  'redirect',
  'final',
  'publisher_self',
  'manual',
  'historical'
]);

// Defines persistent user-scoped URL observations for subscribed feeds.
export default sequelize => sequelize.define(
  'feed_url_aliases',
  {
    // Provides the stable identifier for this observed feed URL.
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    // Identifies the user whose feed identity namespace owns this alias.
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Identifies the subscribed feed reached through this alias.
    feedId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Preserves the first observed spelling of the URL for history and diagnostics.
    originalUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { len: [1, 8192] }
    },
    // Stores the conservative comparison-only URL without changing the active fetch URL.
    normalizedUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { len: [1, 8192] }
    },
    // Provides an indexable exact identity for the potentially long normalized URL.
    normalizedUrlHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      validate: { len: [64, 64], is: /^[0-9a-f]{64}$/ }
    },
    // Records how RSSMonster learned this URL for the subscribed feed.
    aliasType: {
      type: DataTypes.ENUM(...FEED_URL_ALIAS_TYPES),
      allowNull: false
    },
    // Records when this alias was first observed for the feed.
    firstSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    // Records when this alias most recently resolved to the feed.
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    timestamps: false,
    indexes: [
      {
        name: 'feed_url_aliases_user_hash_unique',
        unique: true,
        fields: ['userId', 'normalizedUrlHash']
      },
      {
        name: 'feed_url_aliases_user_feed_idx',
        fields: ['userId', 'feedId']
      },
      {
        name: 'feed_url_aliases_feed_idx',
        fields: ['feedId']
      },
      {
        name: 'feed_url_aliases_user_type_idx',
        fields: ['userId', 'aliasType']
      }
    ],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
);
