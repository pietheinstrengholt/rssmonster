import '../setup/database.js';
import db from '../../models/index.js';

const TEST_DATABASE_NAME = 'rssmonstertest';

export async function resetDatabase() {
  const { sequelize } = db;
  const databaseName = sequelize.getDatabaseName();

  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to reset database "${databaseName}". Tests must use "${TEST_DATABASE_NAME}".`
    );
  }

  // Hard reset: drop all tables & recreate from models
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    await sequelize.drop();
    await sequelize.sync();
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
  }
}
