import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';

export const Setting = sequelize.define(
  "settings",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: Sequelize.INTEGER,
      autoIncrement: false,
      allowNull: false,
    },
    categoryId: {
      type: Sequelize.STRING,
      autoIncrement: false,
      allowNull: false,
      defaultValue: "%"
    },
    feedId: {
      type: Sequelize.STRING,
      autoIncrement: false,
      allowNull: false,
      defaultValue: "%"
    }, 
    status: {
      type: Sequelize.STRING,
      autoIncrement: false,
      allowNull: false,
      defaultValue: "unread"
    },
    sort: {
      type: Sequelize.STRING,
      autoIncrement: false,
      allowNull: false,
      defaultValue: "DESC"
    },
    minAdvertisementScore: {
      type: Sequelize.INTEGER,
      autoIncrement: false,
      allowNull: false,
      defaultValue: 0
    },
    minSentimentScore: {
      type: Sequelize.INTEGER,
      autoIncrement: false,
      allowNull: false,
      defaultValue: 0
    },
    minQualityScore: {
      type: Sequelize.INTEGER,
      autoIncrement: false,
      allowNull: false,
      defaultValue: 0
    },
    viewMode: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'full'
    },
    clusterView: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

export default Setting;