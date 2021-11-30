require("dotenv").config();

const Sequelize = require("sequelize");
const path = require("path");
const env = process.env.NODE_ENV || "development";
const config = require(path.join(__dirname + "/../config/config.js"))[env];

if (config.use_env_variable) {
  var sequelize = new Sequelize(process.env[config.use_env_variable], config, {
    define: {
      timestamps: true
    },
    logging: false
  });
} else {
  var sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    {
      ...config,
      define: {
        timestamps: true
      },
      logging: false,
      pool: {
        max: 20,
        min: 0,
        acquire: 60000,
        idle: 10000
      }
    }
  );
}

module.exports = sequelize;
