import Sequelize from 'sequelize';
import { sequelize } from '../util/database.js';
import { Category } from './category.js';
import { Feed } from './feed.js';
import { Article } from './article.js';
import { hash } from 'bcryptjs';

export const User = sequelize.define(
  "users",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    username: {
      type: Sequelize.STRING,
      autoIncrement: false,
      allowNull: false
    },
    password: {
      type: Sequelize.STRING,
      autoIncrement: false,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    hash: {
      type: Sequelize.STRING,
      allowNull: false
    },
    role: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'user' // Default role is set to 'user'
    },
    lastLogin: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  },
  {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

//add associations
User.hasMany(Category);
User.hasMany(Feed);
User.hasMany(Article);

export default User;