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
        allowNull: false
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
        defaultValue: 'DESC'
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
      clusterView: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'all'
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Setting;
};