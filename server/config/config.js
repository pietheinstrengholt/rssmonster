import dotenv from 'dotenv';
dotenv.config();

const env = process.env.NODE_ENV || 'development';

export default {
  [env]: {
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        host: process.env.DB_HOST,
        dialect: 'mysql'
      }
};