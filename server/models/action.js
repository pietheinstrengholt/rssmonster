import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';

export const Action = sequelize.define(
  "actions",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    userId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    actionType: {
      type: Sequelize.STRING,
      allowNull: false
    },
    regularExpression: {
      type: Sequelize.TEXT,
      allowNull: false
    }
  },
  {
    timestamps: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

export default Action;
