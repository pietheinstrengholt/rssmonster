const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');

dotenv.config({ quiet: true });

const SUPPORTED_DIALECTS = new Set(['mysql', 'sqlite']);

// Resolves and validates the selected database dialect.
const getDialect = () => {
  const dialect = process.env.DB_DIALECT || 'mysql';

  if (!SUPPORTED_DIALECTS.has(dialect)) {
    throw new Error('DB_DIALECT must be either "mysql" or "sqlite".');
  }

  return dialect;
};

// Requires one environment variable for the selected database dialect.
const requireEnvironmentVariable = key => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required env var for ${getDialect()}: ${key}`);
  }

  return value;
};

// Creates the shared database configuration for one runtime environment.
const createDatabaseConfig = logging => {
  const dialect = getDialect();

  if (dialect === 'sqlite') {
    const storage = path.resolve(
      __dirname,
      '..',
      requireEnvironmentVariable('DB_STORAGE')
    );
    fs.mkdirSync(path.dirname(storage), { recursive: true });

    return {
      dialect,
      storage,
      logging
    };
  }

  return {
    username: requireEnvironmentVariable('DB_USERNAME'),
    password: requireEnvironmentVariable('DB_PASSWORD'),
    database: requireEnvironmentVariable('DB_DATABASE'),
    host: requireEnvironmentVariable('DB_HOSTNAME'),
    port: process.env.DB_PORT || 3306,
    dialect,
    logging
  };
};

module.exports = {
  development: createDatabaseConfig(console.log),
  test: createDatabaseConfig(false),
  production: createDatabaseConfig(false)
};
