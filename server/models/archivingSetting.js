import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define(
  'ArchivingSetting',
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
    neverDeleteUnreadArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    neverDeleteFavorites: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    neverDeleteClickedArticles: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    maximumArticleAge: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7,
      validate: { isInt: true, min: 1, max: 2147483647 }
    },
    maximumArticleAgeUnit: {
      type: DataTypes.ENUM('days', 'weeks', 'months', 'years'),
      allowNull: false,
      defaultValue: 'years',
      validate: { isIn: [['days', 'weeks', 'months', 'years']] }
    },
    // Null leaves the article count unlimited until the user configures a cap.
    maximumArticlesPerFeed: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: { isInt: true, min: 1, max: 1000000 }
    },
    maximumArticlesTotal: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      validate: { isInt: true, min: 1, max: 1000000000 }
    }
  },
  {
    tableName: 'archiving_settings',
    indexes: [
      { name: 'archiving_settings_userId_unique', unique: true, fields: ['userId'] }
    ],
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  }
);
