import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import { Feed } from './feed.js';

export const Category = sequelize.define(
  "categories",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    categoryOrder: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    }
  },
  {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

//add associations
Category.hasMany(Feed);
Feed.belongsTo(Category);

export default Category;