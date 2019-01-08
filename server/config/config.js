require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USERNAME || 'rssmonster',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'rssmonster',
    host: process.env.DB_HOSTNAME || 'localhost',
    dialect: 'mysql',
    charset: "utf8mb4",
    collate: "utf8mb4_general_ci"
  },
  test: {
    username: 'database_test',
    password: null,
    database: 'database_test',
    host: '127.0.0.1',
    dialect: 'mysql'
  },
  production: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOSTNAME,
    dialect: 'mysql',
    charset: "utf8mb4",
    collate: "utf8mb4_general_ci"
  }
};