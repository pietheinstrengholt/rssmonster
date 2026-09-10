'use strict';

// Preserve the complete SQLite table definition and dependent data during nullability changes.
const changeSqliteCredentials = async (queryInterface, allowNull) => {
  const { sequelize } = queryInterface;
  const [definitions] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  const definition = definitions[0]?.sql;
  if (!definition) throw new Error('Unable to read the SQLite users table definition.');
  let updated = definition;
  for (const column of ['password', 'feverCredentialHash']) {
    const pattern = new RegExp('([`"]' + column + '[`"]\\s+[A-Z]+(?:\\(\\d+\\))?)(\\s+NOT NULL)?', 'i');
    if (!pattern.test(updated)) throw new Error(`Unable to locate users.${column}.`);
    updated = updated.replace(pattern, allowNull ? '$1' : '$1 NOT NULL');
  }
  const backupSql = updated.replace(
    /^(CREATE TABLE\s+(?:IF NOT EXISTS\s+)?)(?:[`"]users[`"]|\[users\]|users)/i,
    '$1`users_oidc_backup`'
  );
  if (backupSql === updated) throw new Error('Unable to create the SQLite users backup definition.');
  const [objects] = await sequelize.query("SELECT sql FROM sqlite_master WHERE tbl_name = 'users' AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name");
  const [sequences] = await sequelize.query("SELECT seq FROM sqlite_sequence WHERE name = 'users'");
  const [foreignKeys] = await sequelize.query('PRAGMA foreign_keys');
  const enabled = foreignKeys.foreign_keys === 1;
  if (enabled) await sequelize.query('PRAGMA foreign_keys = OFF');
  try {
    await sequelize.transaction(async transaction => {
      await sequelize.query(backupSql, { transaction });
      await sequelize.query('INSERT INTO `users_oidc_backup` SELECT * FROM `users`', { transaction });
      await sequelize.query('DROP TABLE `users`', { transaction });
      await sequelize.query('ALTER TABLE `users_oidc_backup` RENAME TO `users`', { transaction });
      for (const object of objects) await sequelize.query(object.sql, { transaction });
      // Never reuse a deleted account's ID, even when it exceeded every surviving ID.
      if (sequences.length) {
        await sequelize.query("INSERT INTO sqlite_sequence (name, seq) SELECT 'users', :seq WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'users')", {
          replacements: { seq: sequences[0].seq }, transaction
        });
        await sequelize.query("UPDATE sqlite_sequence SET seq = MAX(seq, :seq) WHERE name = 'users'", {
          replacements: { seq: sequences[0].seq }, transaction
        });
      }
      const [violations] = await sequelize.query('PRAGMA foreign_key_check', { transaction });
      if (violations.length) throw new Error('SQLite foreign key validation failed after rebuilding users.');
    });
  } finally {
    if (enabled) await sequelize.query('PRAGMA foreign_keys = ON');
  }
};

const changeCredentials = async (queryInterface, Sequelize, allowNull) => {
  if (queryInterface.sequelize.getDialect() === 'sqlite') return changeSqliteCredentials(queryInterface, allowNull);
  await queryInterface.changeColumn('users', 'password', { type: Sequelize.STRING, allowNull });
  await queryInterface.changeColumn('users', 'feverCredentialHash', { type: Sequelize.STRING, allowNull });
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await changeCredentials(queryInterface, Sequelize, true);
  },
  async down(queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query('SELECT COUNT(*) AS count FROM users WHERE password IS NULL OR feverCredentialHash IS NULL');
    if (Number(rows[0].count)) throw new Error('Cannot restore required credentials while OIDC-only accounts exist.');
    await changeCredentials(queryInterface, Sequelize, false);
  }
};
