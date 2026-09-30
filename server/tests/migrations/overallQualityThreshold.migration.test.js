import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260930000000-add-overall-quality-threshold.mjs';

it('leaves existing component thresholds intact and defaults Overall quality to off', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'overall_quality_migration_test';
  const adapter = {
    addColumn: (name, column, options) => {
      expect(name).toBe(db.Setting.getTableName());
      return query.addColumn(table, column, options);
    },
    removeColumn: (name, column) => {
      expect(name).toBe(db.Setting.getTableName());
      return query.removeColumn(table, column);
    }
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true }, minQualityScore: DataTypes.INTEGER });
  try {
    await query.bulkInsert(table, [{ id: 1, minQualityScore: 65 }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2, minQualityScore: 40 }]);
    expect((await query.select(null, table)).map(row => row.minOverallQualityScore)).toEqual([0, 0]);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('minOverallQualityScore');
    expect((await query.select(null, table, { order: [['id', 'ASC']] })).map(row => row.minQualityScore)).toEqual([65, 40]);
  } finally {
    await query.dropTable(table);
  }
});
