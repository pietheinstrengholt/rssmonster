require('dotenv').load();

const Sequelize = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD, {
    dialect: 'mysql',
    host: process.env.DB_HOSTNAME
  });

module.exports = sequelize;