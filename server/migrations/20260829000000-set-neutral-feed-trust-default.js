'use strict';

const SQLITE_BACKUP_TABLE = 'feeds_feedtrust_default_backup';

const replaceSqliteFeedTrustDefault = async (queryInterface, defaultValue) => {
  const { sequelize } = queryInterface;
  const [tableDefinitions] = await sequelize.query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'feeds'"
  );
  const createTableSql = tableDefinitions[0]?.sql;

  if (!createTableSql) throw new Error('Unable to read the SQLite feeds table definition.');

  const defaultPattern = /([`"]feedTrust[`"]\s+[^,]*?\bDEFAULT\s+)(?:'[^']*'|"[^"]*"|[^\s,)]+)/i;
  const updatedTableSql = createTableSql.replace(defaultPattern, `$1${defaultValue}`);

  if (updatedTableSql === createTableSql) {
    throw new Error('Unable to update the SQLite feeds.feedTrust default.');
  }

  const backupTableSql = updatedTableSql.replace(
    /^(CREATE TABLE\s+(?:IF NOT EXISTS\s+)?)(?:[`"]feeds[`"]|\[feeds\]|feeds)/i,
    (_, prefix) => `${prefix}\`${SQLITE_BACKUP_TABLE}\``
  );

  if (backupTableSql === updatedTableSql) {
    throw new Error('Unable to create the SQLite feeds backup definition.');
  }

  const [schemaObjects] = await sequelize.query(
    "SELECT sql FROM sqlite_master WHERE tbl_name = 'feeds' "
      + "AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name"
  );
  const [foreignKeyRows] = await sequelize.query('PRAGMA foreign_keys');
  const foreignKeysEnabled = foreignKeyRows.foreign_keys === 1;

  if (foreignKeysEnabled) await sequelize.query('PRAGMA foreign_keys = OFF');

  let transaction;

  try {
    transaction = await sequelize.transaction();
    await sequelize.query(backupTableSql, { transaction });
    await sequelize.query(
      `INSERT INTO \`${SQLITE_BACKUP_TABLE}\` SELECT * FROM \`feeds\``,
      { transaction }
    );
    await sequelize.query('DROP TABLE `feeds`', { transaction });
    await sequelize.query(
      `ALTER TABLE \`${SQLITE_BACKUP_TABLE}\` RENAME TO \`feeds\``,
      { transaction }
    );

    for (const schemaObject of schemaObjects) {
      await sequelize.query(schemaObject.sql, { transaction });
    }

    const [foreignKeyViolations] = await sequelize.query(
      'PRAGMA foreign_key_check',
      { transaction }
    );

    if (foreignKeyViolations.length > 0) {
      throw new Error('SQLite foreign key validation failed after rebuilding feeds.');
    }

    await transaction.commit();
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  } finally {
    if (foreignKeysEnabled) await sequelize.query('PRAGMA foreign_keys = ON');
  }
};

const changeFeedTrustDefault = async (queryInterface, Sequelize, defaultValue) => {
  if (queryInterface.sequelize.getDialect() === 'sqlite') {
    await replaceSqliteFeedTrustDefault(queryInterface, defaultValue);
    return;
  }

  await queryInterface.changeColumn('feeds', 'feedTrust', {
    type: Sequelize.FLOAT,
    allowNull: false,
    defaultValue
  });
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await changeFeedTrustDefault(queryInterface, Sequelize, 0.75);
  },

  async down(queryInterface, Sequelize) {
    await changeFeedTrustDefault(queryInterface, Sequelize, 0.5);
  }
};
