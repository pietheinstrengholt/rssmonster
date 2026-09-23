import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923006000-add-sidebar-pinned-items.mjs';

it('adds unpinned defaults to existing and new feed/category rows and rolls back safely', async () => {
  const query = db.sequelize.getQueryInterface();
  const tables = { feeds: 'pins_feeds_migration_test', categories: 'pins_categories_migration_test' };
  const adapter = {
    addColumn: (table, column, options) => query.addColumn(tables[table], column, options),
    removeColumn: (table, column) => query.removeColumn(tables[table], column)
  };
  for (const table of Object.values(tables)) {
    await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true }, name: DataTypes.STRING });
    await query.bulkInsert(table, [{ id: 1, name: 'Existing' }]);
  }
  try {
    await up(adapter, DataTypes);
    for (const table of Object.values(tables)) {
      await query.bulkInsert(table, [{ id: 2, name: 'New' }]);
      const rows = await query.select(null, table);
      expect(rows.map(row => Boolean(row.pinned))).toEqual([false, false]);
      expect((await query.describeTable(table)).pinned.allowNull).toBe(false);
      await query.bulkUpdate(table, { pinned: true }, { id: 1 });
      expect(Boolean((await query.select(null, table, { where: { id: 1 } }))[0].pinned)).toBe(true);
    }
    await down(adapter);
    for (const table of Object.values(tables)) {
      expect(await query.describeTable(table)).not.toHaveProperty('pinned');
      expect(await query.select(null, table, { order: [['id', 'ASC']] })).toEqual([{ id: 1, name: 'Existing' }, { id: 2, name: 'New' }]);
    }
  } finally {
    for (const table of Object.values(tables)) await query.dropTable(table);
  }
});
