import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { normalizeSidebarSectionOrder } from '../../services/sidebarSettings.js';
import { up, down } from '../../migrations/20260923007000-add-sidebar-section-order.mjs';

it('preserves old settings, supports JSON orders, and rolls back without losing rows', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'sidebar_section_order_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    showTotalCount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  });
  try {
    await query.bulkInsert(table, [{ id: 1, showTotalCount: false }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2 }]);
    const rows = await query.select(null, table, { order: [['id', 'ASC']] });
    for (const row of rows) {
      expect(row.sectionOrder).toBeNull();
      expect(normalizeSidebarSectionOrder(row.sectionOrder)).toEqual([
        'pinned', 'smart-folders', 'all-feeds', 'top-tags', 'categories'
      ]);
    }
    expect(rows.map(row => Boolean(row.showTotalCount))).toEqual([false, true]);
    const custom = ['categories', 'smart-folders', 'all-feeds', 'top-tags'];
    await query.bulkUpdate(table, { sectionOrder: JSON.stringify(custom) }, { id: 1 });
    const [saved] = await query.select(null, table, { where: { id: 1 } });
    expect(typeof saved.sectionOrder === 'string' ? JSON.parse(saved.sectionOrder) : saved.sectionOrder).toEqual(custom);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('sectionOrder');
    expect(await query.select(null, table)).toHaveLength(2);
  } finally {
    await query.dropTable(table);
  }
});
