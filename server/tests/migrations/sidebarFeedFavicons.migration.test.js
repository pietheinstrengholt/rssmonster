import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923004000-add-sidebar-feed-favicons.mjs';

it('enables favicons for existing and new settings and preserves rows on rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'sidebar_favicons_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true } });
  try {
    await query.bulkInsert(table, [{ id: 1 }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2 }]);
    expect((await query.select(null, table)).map(row => Boolean(row.showFeedFavicons))).toEqual([true, true]);
    await query.bulkUpdate(table, { showFeedFavicons: false }, { id: 1 });
    expect(Boolean((await query.select(null, table, { where: { id: 1 } }))[0].showFeedFavicons)).toBe(false);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('showFeedFavicons');
    expect(await query.select(null, table)).toHaveLength(2);
  } finally {
    await query.dropTable(table);
  }
});
