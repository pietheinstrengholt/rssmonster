import { DataTypes, Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20261018080000-add-multi-island-score.mjs';

describe('multi-Island score migration', () => {
  it.each(['configured', 'sqlite'])('preserves history and adds a nullable FLOAT on %s', async dialect => {
    const local = dialect === 'sqlite';
    const sequelize = local ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) : db.sequelize;
    const query = sequelize.getQueryInterface();
    const table = 'multi_island_migration_articles';
    const adapter = { describeTable: () => query.describeTable(table), addColumn: (_, ...args) => query.addColumn(table, ...args) };
    try {
      await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true },
        interestScore: { type: DataTypes.FLOAT, defaultValue: 0 }, title: DataTypes.TEXT });
      await query.bulkInsert(table, [{ id: 1, interestScore: 0.5, title: 'Historical Article' }]);
      await up(adapter, Sequelize);
      await up(adapter, Sequelize);
      const column = (await query.describeTable(table)).multiIslandScore;
      expect(column.allowNull).toBe(true);
      expect(column.defaultValue).toBeNull();
      expect(column.type).toMatch(/FLOAT/i);
      expect((await query.select(null, table, { where: { id: 1 } }))[0]).toMatchObject({
        interestScore: 0.5, title: 'Historical Article', multiIslandScore: null
      });
      await query.bulkInsert(table, [{ id: 2 }]);
      expect((await query.select(null, table, { where: { id: 2 } }))[0].multiIslandScore).toBeNull();
      await query.bulkUpdate(table, { multiIslandScore: 0.1234 }, { id: 1 });
      expect(Number((await query.select(null, table, { where: { id: 1 } }))[0].multiIslandScore)).toBeCloseTo(0.1234, 4);
      await expect(down()).rejects.toThrow('backup');
    } finally {
      await query.dropTable(table);
      if (local) await sequelize.close();
    }
  });
});
