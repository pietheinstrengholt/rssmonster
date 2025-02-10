import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';

export const Tag = sequelize.define(
  "tags",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: Sequelize.INTEGER,
      allowNull: false
    }
  },
  {
    updatedAt: false,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

export default Tag;