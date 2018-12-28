const Sequelize = require('sequelize');

const sequelize = require('../util/database');

const Category = sequelize.define('categories', {
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
  category_order: {
    type: Sequelize.INTEGER,
    defaultValue: 0
  }
});

module.exports = Category;