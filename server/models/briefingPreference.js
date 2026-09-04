import { DataTypes } from 'sequelize';

const EMAIL_DIGEST_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const validateEmailDigestTime = value => {
  if (!EMAIL_DIGEST_TIME_PATTERN.test(String(value || ''))) {
    throw new Error('emailDigestTime must use 24-hour HH:mm format');
  }
};

const validateEmailDigestTimezone = value => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new Error('emailDigestTimezone must be a valid IANA timezone');
  }
};

// This factory creates the per-user Daily Briefing preference model.
export default (sequelize) => sequelize.define(
  'BriefingPreference',
  {
    // Provides the stable identifier for this Daily Briefing preference record.
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    // Identifies the sole user who owns these Daily Briefing preferences.
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // When true, limits the briefing to articles the user has not read.
    includeOnlyUnreadArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // When true, scrolling past an unread briefing article marks it as read.
    markAsReadOnScroll: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // When true, allows developing events to contribute briefing articles.
    includeDevelopingEvents: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // When true, limits the briefing to articles with a positive interest match.
    showOnlyInterestMatchedArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // When true, limits the briefing to articles selected as developing stories.
    showOnlyDevelopingEventArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Requires each briefing event to contain at least this many distinct sources.
    minDistinctSources: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      validate: {
        isInt: true,
        min: 1,
        max: 127
      }
    },
    // When true, gives higher-trust feeds preference during briefing selection.
    prioritizeHighTrust: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Selects a 24-hour or seven-day candidate window, defaulting to seven days.
    selectionPeriod: {
      type: DataTypes.ENUM('24h', '7d'),
      allowNull: false,
      defaultValue: '7d'
    },
    // Enables one scheduled briefing email for the user on each local date.
    emailDigestEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    // Stores the user's local delivery time without coupling it to a server timezone.
    emailDigestTime: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: '08:00',
      validate: { validateEmailDigestTime }
    },
    // Identifies the IANA timezone used to interpret the configured local delivery time.
    emailDigestTimezone: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'UTC',
      validate: { validateEmailDigestTimezone }
    },
    // Avoids sending a scheduled message when the canonical briefing is empty.
    emailDigestSkipWhenEmpty: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  },
  {
    tableName: 'briefing_preferences',
    indexes: [
      {
        name: 'briefing_preferences_userId_unique',
        unique: true,
        fields: ['userId']
      }
    ],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
);
