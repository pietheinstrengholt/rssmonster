import { up as runtimeUp, down as runtimeDown } from '../../migrations/20260918002000-add-inference-runtime-overrides.mjs';
import { describe, expect, it, vi } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260911000000-add-inference-settings.mjs';

describe('inference settings migration', () => {
  it('uses cross-dialect columns and a database singleton constraint', async () => {
    const queryInterface = { createTable: vi.fn(), addConstraint: vi.fn(), dropTable: vi.fn() };
    await up(queryInterface, DataTypes);
    expect(queryInterface.createTable).toHaveBeenCalledWith('inference_settings', expect.objectContaining({
      id: expect.objectContaining({ primaryKey: true, defaultValue: 1 }), apiKeyEncrypted: expect.objectContaining({ allowNull: true })
    }));
    expect(queryInterface.addConstraint).toHaveBeenCalledWith('inference_settings', expect.objectContaining({ type: 'check', where: { id: 1 } }));
    await down(queryInterface); expect(queryInterface.dropTable).toHaveBeenCalledWith('inference_settings');
  });
  it('applies the same migration through the configured test database dialect', async () => {
    const query = db.sequelize.getQueryInterface();
    const table = 'inference_settings_migration_test';
    const adapter = {
      createTable: (_name, columns) => query.createTable(table, columns),
      addConstraint: (_name, options) => query.addConstraint(table, { ...options, name: 'inference_migration_singleton' }),
      dropTable: () => query.dropTable(table)
    };
    try {
      await up(adapter, DataTypes);
      await query.bulkInsert(table, [{ id: 1, baseUrl: 'http://test', createdAt: new Date(), updatedAt: new Date() }]);
      await expect(query.bulkInsert(table, [{ id: 2, baseUrl: 'http://other', createdAt: new Date(), updatedAt: new Date() }])).rejects.toThrow();
    } finally { await down(adapter); }
  });
  it('migrates and rolls back SQLite and enforces singleton writes at database level', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    try {
      const query = sequelize.getQueryInterface(); await up(query, DataTypes);
      await query.bulkInsert('inference_settings', [{ id: 1, baseUrl: 'http://test', createdAt: new Date(), updatedAt: new Date() }]);
      await expect(query.bulkInsert('inference_settings', [{ id: 2, baseUrl: 'http://other', createdAt: new Date(), updatedAt: new Date() }])).rejects.toThrow();
      await down(query); expect(await query.showAllTables()).not.toContain('inference_settings');
    } finally { await sequelize.close(); }
  });
});

it.each(['mysql', 'sqlite'])('preserves inference credentials through runtime settings migration and rollback on %s', async dialect => {
  const sequelize = dialect === 'sqlite' ? new Sequelize({ dialect, storage: ':memory:', logging: false }) : db.sequelize;
  const query = sequelize.getQueryInterface();
  const table = 'inference_runtime_migration_test';
  const adapter = {
    createTable: (_name, columns) => query.createTable(table, columns),
    addConstraint: (_name, options) => query.addConstraint(table, { ...options, name: 'inference_runtime_test_singleton' }),
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column),
    dropTable: () => query.dropTable(table)
  };
  try {
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 1, baseUrl: 'http://existing.example', apiKeyEncrypted: 'existing-ciphertext', createdAt: new Date(), updatedAt: new Date() }]);
    await runtimeUp(adapter, DataTypes);
    const rows = await query.select(null, table);
    expect(rows[0]).toMatchObject({ baseUrl: 'http://existing.example', apiKeyEncrypted: 'existing-ciphertext', runtimeOverrides: null });
    await runtimeDown(adapter);
    expect((await query.select(null, table))[0]).toMatchObject({ baseUrl: 'http://existing.example', apiKeyEncrypted: 'existing-ciphertext' });
    expect(await query.describeTable(table)).not.toHaveProperty('runtimeOverrides');
  } finally {
    await down(adapter);
    if (dialect === 'sqlite') await sequelize.close();
  }
});
