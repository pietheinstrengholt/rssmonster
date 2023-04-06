import dotenv from 'dotenv';
import { Sequelize } from "sequelize";
dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOSTNAME,
    dialect: 'mysql',
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    logging: process.env.NODE_ENV === 'production' ? false : console.log,
    pool: {
      max: 15,
      min: 0,
      idle: 10000
    }
  }
);

export default sequelize;