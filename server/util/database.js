import dotenv from 'dotenv'
import { Sequelize } from "sequelize"

dotenv.config()

export const sequelize = new Sequelize(
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  process.env.DB_DATABASE,
  {
    host: process.env.DB_HOSTNAME,
    dialect: 'mysql',
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    logging: false
  }
);

export default sequelize;