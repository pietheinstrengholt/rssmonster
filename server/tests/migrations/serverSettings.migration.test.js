import { describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from 'sequelize';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260918000000-add-server-settings.mjs';

const verifyMigration = async (sequelize, table) => {
  const query = sequelize.getQueryInterface();
  const adapter = {
    createTable: (_name, columns) => query.createTable(table, columns),
    dropTable: () => query.dropTable(table)
  };
  try {
    await up(adapter, DataTypes);
    const Setting = sequelize.define(table, {
      key: { type: DataTypes.STRING(100), primaryKey: true },
      value: { type: DataTypes.JSON, allowNull: false }
    }, { tableName: table });
    expect(await Setting.count()).toBe(0);
    await Setting.create({ key: 'allowRegistration', value: false });
    expect((await Setting.findByPk('allowRegistration')).value).toBe(false);
    await expect(Setting.create({ key: 'allowRegistration', value: true })).rejects.toThrow();
    await Setting.upsert({ key: 'allowRegistration', value: true });
    expect((await Setting.findByPk('allowRegistration')).value).toBe(true);
  } finally {
    await down(adapter);
  }
  expect(await query.showAllTables()).not.toContain(table);
};

describe('server settings migration', () => {
  it('preserves booleans, enforces unique keys and rolls back on the configured dialect', async () => {
    await verifyMigration(db.sequelize, 'server_settings_migration_test');
  });
  it('supports SQLite', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
      await verifyMigration(sequelize, 'server_settings');
    } finally {
      await sequelize.close();
    }
  });
});
