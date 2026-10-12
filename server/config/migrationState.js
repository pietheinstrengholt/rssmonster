import { DataTypes } from 'sequelize';
import { MIGRATION_STATE_TABLE } from '../migrations/lib/baseline24Definition.mjs';

export const readMigrationHistory = async (sequelize, { allowIncomplete = false } = {}) => {
  const query = sequelize.getQueryInterface();
  const tables = await query.showAllTables();
  for (const name of ['SequelizeMeta', MIGRATION_STATE_TABLE]) {
    if (tables.filter(table => table.toLowerCase() === name.toLowerCase()).length > 1) throw new Error(`Ambiguous migration metadata tables for ${name}. Refusing speculative history reconciliation.`);
  }
  let names = [];
  let state;
  if (tables.some(name => name.toLowerCase() === 'sequelizemeta')) {
    const columns = await query.describeTable('SequelizeMeta');
    if (!columns.name?.primaryKey || columns.name.allowNull) throw new Error('Invalid SequelizeMeta: name must be a non-null primary key. Migration history cannot be trusted.');
    const [rows] = await sequelize.query('SELECT name FROM `SequelizeMeta` ORDER BY name');
    names = rows.map(row => row.name);
  }
  if (tables.some(name => name.toLowerCase() === MIGRATION_STATE_TABLE.toLowerCase())) {
    const columns = await query.describeTable(MIGRATION_STATE_TABLE);
    const expected = ['id', 'baselineVersion', 'lastMigration', 'schemaHash', 'inProgress'];
    if (Object.keys(columns).length !== expected.length || !expected.every(name => columns[name]) || !columns.id.primaryKey || (columns.id.allowNull && sequelize.getDialect() !== 'sqlite') || columns.schemaHash.allowNull) {
      throw new Error('Invalid RSSMonsterMigrationState schema. Refusing speculative history repair.');
    }
    const [rows] = await sequelize.query(`SELECT * FROM \`${MIGRATION_STATE_TABLE}\``);
    if (rows.length > 1 || rows.some(row => row.id !== 1 || !/^[a-f0-9]{64}$/.test(row.schemaHash))) throw new Error('Invalid RSSMonsterMigrationState record. Refusing speculative history repair.');
    state = rows[0];
    if (!allowIncomplete && state && state.inProgress !== null) throw new Error(`Incomplete migration ${state.inProgress}: its completion was not recorded. Inspect the failure and restore/verify the database before explicit operator recovery; automatic replay is disabled.`);
  }
  return { names, state, tables };
};

export const initializeMigrationState = async (sequelize, history, hash, lastMigration, baselineVersion) => {
  const query = sequelize.getQueryInterface();
  if (!history.tables.some(name => name.toLowerCase() === MIGRATION_STATE_TABLE.toLowerCase())) {
    await query.createTable(MIGRATION_STATE_TABLE, {
      id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      baselineVersion: { type: DataTypes.STRING(16), allowNull: true },
      lastMigration: { type: DataTypes.STRING(255), allowNull: true },
      schemaHash: { type: DataTypes.STRING(64), allowNull: false },
      inProgress: { type: DataTypes.STRING(255), allowNull: true }
    }, { charset: 'utf8', collate: 'utf8_unicode_ci' });
  }
  if (!history.state) await query.bulkInsert(MIGRATION_STATE_TABLE, [{ id: 1, baselineVersion, lastMigration, schemaHash: hash, inProgress: null }]);
};

export const beginMigration = (sequelize, name) => sequelize.getQueryInterface().bulkUpdate(MIGRATION_STATE_TABLE, { inProgress: name }, { id: 1 });

// Only tracking writes are transactional here. Historical migrations retain
// their own transaction boundaries; MySQL DDL is never claimed to be atomic.
export const completeMigration = async (sequelize, name, hash, baselineVersion, assertHeld, { alreadyRecorded = false } = {}) => {
  await assertHeld();
  await sequelize.transaction(async transaction => {
    const query = sequelize.getQueryInterface();
    if (!alreadyRecorded) await query.bulkInsert('SequelizeMeta', [{ name }], { transaction });
    await query.bulkUpdate(MIGRATION_STATE_TABLE, { lastMigration: name, schemaHash: hash, baselineVersion, inProgress: null }, { id: 1 }, { transaction });
    await assertHeld();
  });
};
