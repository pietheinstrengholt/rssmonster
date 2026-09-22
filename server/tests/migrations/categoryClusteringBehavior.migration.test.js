import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260922002000-add-category-clustering-behavior.mjs';

it('keeps existing and future categories null and preserves rows through rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'category_clustering_migration_test';
  const adapter = {
    describeTable: () => query.describeTable(table),
    addColumn: (_name, column, options) => query.addColumn(table, column, options),
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true } });
  try {
    await query.bulkInsert(table, [{ id: 1 }]);
    await up(adapter, DataTypes);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2 }]);
    expect(await query.select(null, table, { order: [['id', 'ASC']] })).toEqual([
      { id: 1, clusteringBehavior: null },
      { id: 2, clusteringBehavior: null }
    ]);
    await down(adapter);
    expect(await query.select(null, table, { order: [['id', 'ASC']] })).toEqual([{ id: 1 }, { id: 2 }]);
    expect(await query.describeTable(table)).not.toHaveProperty('clusteringBehavior');
  } finally {
    await query.dropTable(table);
  }
});
