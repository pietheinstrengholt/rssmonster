import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260925000000-add-briefing-include-hot-articles.mjs';

it('enables Hot articles for existing and future preferences and preserves other settings on rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'briefing_hot_migration_test';
  const adapter = {
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    includeOnlyUnreadArticles: { type: DataTypes.BOOLEAN, allowNull: false }
  });
  try {
    await query.bulkInsert(table, [{ id: 1, includeOnlyUnreadArticles: true }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2, includeOnlyUnreadArticles: false }]);
    const rows = await query.select(null, table, { order: [['id', 'ASC']] });
    expect(rows.map(row => Boolean(row.includeHotArticles))).toEqual([true, true]);
    await query.bulkUpdate(table, { includeHotArticles: false }, { id: 1 });
    const [updated] = await query.select(null, table, { where: { id: 1 } });
    expect(Boolean(updated.includeHotArticles)).toBe(false);
    expect((await query.describeTable(table)).includeHotArticles.allowNull).toBe(false);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('includeHotArticles');
    const restored = await query.select(null, table, { order: [['id', 'ASC']] });
    expect(restored.map(row => [row.id, Boolean(row.includeOnlyUnreadArticles)]))
      .toEqual([[1, true], [2, false]]);
  } finally {
    await query.dropTable(table);
  }
});
