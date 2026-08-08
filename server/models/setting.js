import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Setting = sequelize.define(
    'settings',
    {
      // Provides the stable identifier for this saved application setting record.
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      // Identifies the sole user who owns these saved settings.
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
      },
      // Stores the last selected category filter, with percent meaning all categories.
      categoryId: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '%'
      },
      // Stores the last selected feed filter, with percent meaning all feeds.
      feedId: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '%'
      },
      // Stores the last selected article-status filter, defaulting to unread.
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unread'
      },
      // Stores the selected article ordering, defaulting to newest first.
      sort: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'desc'
      },
      // Sets the minimum acceptable non-promotional content score.
      minAdvertisementScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Sets the minimum acceptable sentiment score.
      minSentimentScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Sets the minimum acceptable writing-quality score.
      minQualityScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Stores the selected article presentation layout, defaulting to full.
      viewMode: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'full'
      },
      // Stores article grouping as none, event, or topic.
      grouping: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'none'
      },
      // When true, includes each event's current developing-story article.
      includeDevelopingEvents: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Stores whether unread coverage should eventually favor reliable feeds.
      prioritizeHighTrust: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Selects system, light, or dark color appearance.
      themeMode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'system',
        validate: {
          isIn: [['system', 'light', 'dark']]
        }
      },
      // Selects whether startup restores the last view or uses application defaults.
      startupViewMode: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'last-used',
        validate: {
          isIn: [['last-used', 'default']]
        }
      },
      // Controls whether scrolling past an article automatically marks it as read.
      markAsReadOnScroll: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Setting;
};
