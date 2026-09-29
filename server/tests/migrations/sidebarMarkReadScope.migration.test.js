import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260929000000-add-sidebar-mark-read-scope.mjs';

it('preserves current-selection read scope for existing and new settings and preserves rows on rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'sidebar_mark_read_scope_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true } });
  try {
    await query.bulkInsert(table, [{ id: 1 }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2 }]);
    expect((await query.select(null, table)).map(row => Boolean(row.markReadVisibleOnly))).toEqual([false, false]);
    await query.bulkUpdate(table, { markReadVisibleOnly: true }, { id: 1 });
    expect(Boolean((await query.select(null, table, { where: { id: 1 } }))[0].markReadVisibleOnly)).toBe(true);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('markReadVisibleOnly');
    expect(await query.select(null, table)).toHaveLength(2);
  } finally {
    await query.dropTable(table);
  }
});
