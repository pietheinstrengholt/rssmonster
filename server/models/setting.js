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
    }
  },
  {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

export default Setting;