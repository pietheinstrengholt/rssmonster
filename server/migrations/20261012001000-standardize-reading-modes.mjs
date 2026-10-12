const SQLITE_BACKUP_TABLE = 'user_settings_view_mode_backup';

const replaceSqliteViewModeDefault = async (queryInterface, defaultValue) => {
  const { sequelize } = queryInterface;
  const [tableDefinitions] = await sequelize.query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_settings'"
  );
  const createTableSql = tableDefinitions[0]?.sql;

  if (!createTableSql) throw new Error('Unable to read the SQLite user_settings table definition.');

  const defaultPattern = /([`"]viewMode[`"]\s+[^,]*?\bDEFAULT\s+)(?:'[^']*'|"[^"]*"|[^\s,)]+)/i;
  const updatedTableSql = createTableSql.replace(defaultPattern, `$1'${defaultValue}'`);

  if (!defaultPattern.test(createTableSql)) throw new Error('Unable to locate the SQLite user_settings.viewMode default.');
  if (updatedTableSql === createTableSql) return;

  const backupTableSql = updatedTableSql.replace(
    /^(CREATE TABLE\s+(?:IF NOT EXISTS\s+)?)(?:[`"]user_settings[`"]|\[user_settings\]|user_settings)/i,
    (_, prefix) => `${prefix}\`${SQLITE_BACKUP_TABLE}\``
  );

  if (backupTableSql === updatedTableSql) {
    throw new Error('Unable to create the SQLite user_settings backup definition.');
  }

  // SQLite changeColumn rebuilds tables without preserving indexes and foreign keys.
  const [schemaObjects] = await sequelize.query(
    "SELECT sql FROM sqlite_master WHERE tbl_name = 'user_settings' "
      + "AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name"
  );
  const [sequences] = await sequelize.query("SELECT seq FROM sqlite_sequence WHERE name = 'user_settings'");
  const [foreignKeyRows] = await sequelize.query('PRAGMA foreign_keys');
  const foreignKeysEnabled = foreignKeyRows.foreign_keys === 1;

  if (foreignKeysEnabled) await sequelize.query('PRAGMA foreign_keys = OFF');

  let transaction;

  try {
    transaction = await sequelize.transaction();
    await sequelize.query(backupTableSql, { transaction });
    await sequelize.query(
      `INSERT INTO \`${SQLITE_BACKUP_TABLE}\` SELECT * FROM \`user_settings\``,
      { transaction }
    );
    await sequelize.query('DROP TABLE `user_settings`', { transaction });
    await sequelize.query(
      `ALTER TABLE \`${SQLITE_BACKUP_TABLE}\` RENAME TO \`user_settings\``,
      { transaction }
    );

    if (sequences.length) {
      await sequelize.query("UPDATE sqlite_sequence SET seq = MAX(seq, :seq) WHERE name = 'user_settings'", {
        replacements: { seq: sequences[0].seq }, transaction
      });
    }

    for (const schemaObject of schemaObjects) {
      await sequelize.query(schemaObject.sql, { transaction });
    }

    const [foreignKeyViolations] = await sequelize.query(
      'PRAGMA foreign_key_check',
      { transaction }
    );

    if (foreignKeyViolations.length > 0) {
      throw new Error('SQLite foreign key validation failed after rebuilding user_settings.');
    }

    await transaction.commit();
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  } finally {
    if (foreignKeysEnabled) await sequelize.query('PRAGMA foreign_keys = ON');
  }
};

const migrateModes = async (queryInterface, defaultValue, pairs) => {
  const { sequelize } = queryInterface;
  if (sequelize.getDialect() === 'sqlite') {
    await replaceSqliteViewModeDefault(queryInterface, defaultValue);
  } else {
    await sequelize.query(`ALTER TABLE ${queryInterface.quoteIdentifier('user_settings')} ALTER COLUMN ${queryInterface.quoteIdentifier('viewMode')} SET DEFAULT '${defaultValue}'`);
  }
  for (const [previous, next] of pairs) {
    await queryInterface.bulkUpdate('user_settings', { viewMode: next }, { viewMode: previous });
  }
};

export const up = queryInterface => migrateModes(queryInterface, 'expanded', [['full', 'expanded'], ['minimal', 'headlines']]);
export const down = queryInterface => migrateModes(queryInterface, 'full', [['expanded', 'full'], ['headlines', 'minimal']]);
