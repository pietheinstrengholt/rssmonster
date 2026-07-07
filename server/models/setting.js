import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Setting = sequelize.define(
    'settings',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true
      },
      categoryId: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '%'
      },
      feedId: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '%'
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'unread'
      },
      sort: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'desc'
      },
      minAdvertisementScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      minSentimentScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      minQualityScore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      viewMode: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'full'
      },
      grouping: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'none'
      },
      themeMode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'system',
        validate: {
          isIn: [['system', 'light', 'dark']]
        }
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Setting;
};
