import '../setup/database.js';
import db from '../../models/index.js';

export async function resetDatabase() {
  const { sequelize } = db;

  // Hard reset: drop all tables & recreate from models
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    await sequelize.drop();
    await sequelize.sync();
  } finally {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
  }
}
