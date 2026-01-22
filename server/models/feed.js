import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Feed = sequelize.define(
    'feeds',
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
      feedName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      feedDesc: {
        type: DataTypes.TEXT
      },
      feedType: {
        type: DataTypes.STRING(16),
        allowNull: true
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false
      },
      favicon: {
        type: DataTypes.STRING
      },
      errorCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      },
      errorSince: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      mutedUntil: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'error', 'disabled'),
        allowNull: false,
        defaultValue: 'active'
      },
      feedTrust: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0.5
      },
      feedDuplicationRate: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
      },
      crawlSince: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      },
      lastFetched: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  );

  return Feed;
};