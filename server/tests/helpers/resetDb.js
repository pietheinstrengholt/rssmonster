import db from '../../models/index.js';

export async function resetDatabase() {
  const { sequelize } = db;
  const dialect = sequelize.getDialect();
  const supportsForeignKeyToggle = dialect === 'mysql' || dialect === 'mariadb';

  // Hard reset: drop all tables & recreate from models
  if (supportsForeignKeyToggle) {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  }

  try {
    await sequelize.sync({ force: true });
  } finally {
    if (supportsForeignKeyToggle) {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }
}