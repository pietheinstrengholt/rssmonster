require('dotenv').load();

module.exports = {
  development: {
    username: 'database_dev',
    password: 'database_dev',
    database: 'database_dev',
    host: '127.0.0.1',
    dialect: 'mysql'
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
    dialect: 'mysql'
  }
};