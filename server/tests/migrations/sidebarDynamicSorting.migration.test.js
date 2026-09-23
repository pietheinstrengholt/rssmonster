import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923005000-add-sidebar-dynamic-sorting.mjs';

it('disables dynamic sorting for existing and new settings and preserves rows on rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'sidebar_dynamic_sort_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true } });
  try {
    await query.bulkInsert(table, [{ id: 1 }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2 }]);
    expect((await query.select(null, table)).map(row => Boolean(row.sortByCurrentSelection))).toEqual([false, false]);
    await query.bulkUpdate(table, { sortByCurrentSelection: true }, { id: 1 });
    expect(Boolean((await query.select(null, table, { where: { id: 1 } }))[0].sortByCurrentSelection)).toBe(true);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('sortByCurrentSelection');
    expect(await query.select(null, table)).toHaveLength(2);
  } finally {
    await query.dropTable(table);
  }
});
