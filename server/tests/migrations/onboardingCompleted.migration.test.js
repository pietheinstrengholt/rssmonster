import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260929001000-add-onboarding-completed.mjs';

it('defaults completion to false and preserves other preferences through rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'onboarding_migration_test';
  const adapter = {
    addColumn: (name, column, options) => {
      expect(name).toBe(db.Setting.getTableName());
      return query.addColumn(table, column, options);
    },
    removeColumn: (_name, column) => query.removeColumn(table, column)
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true }, viewMode: DataTypes.STRING });
  try {
    await query.bulkInsert(table, [{ id: 1, viewMode: 'reader' }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(table, [{ id: 2, viewMode: 'full' }]);
    expect((await query.select(null, table)).map(row => Boolean(row.onboardingCompleted))).toEqual([false, false]);
    await query.bulkUpdate(table, { onboardingCompleted: true }, { id: 1 });
    expect(Boolean((await query.select(null, table, { where: { id: 1 } }))[0].onboardingCompleted)).toBe(true);
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('onboardingCompleted');
    expect((await query.select(null, table, { order: [['id', 'ASC']] })).map(row => row.viewMode)).toEqual(['reader', 'full']);
  } finally {
    await query.dropTable(table);
  }
});
