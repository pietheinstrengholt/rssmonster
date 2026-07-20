import { DataTypes } from 'sequelize';

// This factory creates the per-user Daily Briefing preference model.
export default (sequelize) => sequelize.define(
  'BriefingPreference',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    includeOnlyUnreadArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    includeDevelopingEvents: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    showOnlyInterestMatchedArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    showOnlyDevelopingEventArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
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
    prioritizeHighTrust: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    selectionPeriod: {
      type: DataTypes.ENUM('24h', '7d'),
      allowNull: false,
      defaultValue: '7d'
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
