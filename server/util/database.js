import dotenv from 'dotenv'
dotenv.config()
import { Sequelize } from "sequelize"
//import config from '../config/config.js';

export const sequelize = new Sequelize(
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  process.env.DB_DATABASE,
  {
    host: process.env.DB_HOSTNAME,
    dialect: 'mysql',
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci"
  }
);

export default sequelize;