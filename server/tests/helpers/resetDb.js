import db from '../../models/index.js';

async function ensureMySqlTestIndexes(sequelize) {
  const [fulltextRows] = await sequelize.query(
    "SHOW INDEX FROM `articles` WHERE Key_name = 'articles_fulltext_title_desc_content'"
  );

  if (!Array.isArray(fulltextRows) || fulltextRows.length === 0) {
    await sequelize.query(
      'ALTER TABLE `articles` ADD FULLTEXT INDEX `articles_fulltext_title_desc_content` (`title`, `description`, `contentOriginal`)'
    );
  }
}

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

    if (supportsForeignKeyToggle) {
      await ensureMySqlTestIndexes(sequelize);
    }
  } finally {
    if (supportsForeignKeyToggle) {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  }
}