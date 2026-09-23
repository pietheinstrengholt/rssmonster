import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923001000-add-sidebar-hide-zero-count-items.mjs';

it('defaults existing and future settings to visible and preserves other settings through rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'sidebar_hide_zero_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    showTotalCount: { type: DataTypes.BOOLEAN, allowNull: false },
    declutterCounts: { type: DataTypes.BOOLEAN, allowNull: false }
  });
  try {
    await query.bulkInsert(table, [{ id: 1, showTotalCount: false, declutterCounts: true }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2, showTotalCount: true, declutterCounts: false }]);
    const rows = await query.select(null, table, { order: [['id', 'ASC']] });
    expect(rows.map(row => Boolean(row.hideZeroCountItems))).toEqual([false, false]);
    await query.bulkUpdate(table, { hideZeroCountItems: true }, { id: 1 });
    const [updated] = await query.select(null, table, { where: { id: 1 } });
    expect(Boolean(updated.hideZeroCountItems)).toBe(true);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('hideZeroCountItems');
    const restored = await query.select(null, table, { order: [['id', 'ASC']] });
    expect(restored.map(row => [row.id, Boolean(row.showTotalCount), Boolean(row.declutterCounts)]))
      .toEqual([[1, false, true], [2, true, false]]);
  } finally {
    await query.dropTable(table);
  }
});
