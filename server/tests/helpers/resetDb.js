import db from '../../models/index.js';

export async function resetDatabase() {
  const { sequelize } = db;

  // Hard reset: drop all tables & recreate from models
  await sequelize.sync({ force: true });
}