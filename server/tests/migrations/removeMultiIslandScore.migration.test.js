import { DataTypes, Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20261021000000-remove-multi-island-score.mjs';

describe('retired coverage migration', () => {
  it.each(['configured', 'sqlite'])('preserves scores, state, indexes and dependent rows on %s', async dialect => {
    const local = dialect === 'sqlite';
    const sequelize = local ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) : db.sequelize;
    const query = sequelize.getQueryInterface();
    const table = 'retired_coverage_articles';
    const child = 'retired_coverage_tags';
    // Run the migration on isolated real tables without disturbing the suite's Articles.
    const adapter = { describeTable: () => query.describeTable(table),
      removeColumn: (_, column) => query.removeColumn(table, column),
      sequelize: { getDialect: () => sequelize.getDialect(),
        query: sql => sequelize.query(sql.replace('ALTER TABLE articles ', `ALTER TABLE ${query.quoteIdentifier(table)} `)) } };
    try {
      await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true },
        interestScore: DataTypes.FLOAT, semanticAffinityScore: DataTypes.FLOAT,
        multiIslandScore: DataTypes.FLOAT, interestScoredAt: DataTypes.DATE,
        savedInd: DataTypes.BOOLEAN, status: DataTypes.STRING, title: DataTypes.TEXT });
      await query.addIndex(table, ['status'], { name: 'retired_coverage_status' });
      await query.createTable(child, { id: { type: DataTypes.INTEGER, primaryKey: true },
        articleId: { type: DataTypes.INTEGER, references: { model: table, key: 'id' }, onDelete: 'CASCADE' } });
      await query.bulkInsert(table, [{ id: 1, interestScore: -0.5, semanticAffinityScore: 0.25,
        multiIslandScore: 0.75, interestScoredAt: new Date('2026-10-18T09:00:00Z'),
        savedInd: true, status: 'read', title: 'Preserved Article' },
      { id: 2, interestScore: 0, semanticAffinityScore: null, multiIslandScore: null, interestScoredAt: null,
        savedInd: false, status: 'unread', title: 'Unevaluated Article' }]);
      await query.bulkInsert(child, [{ id: 1, articleId: 1 }]);
      const before = await query.select(null, table);
      const indexes = await query.showIndex(table);
      await up(adapter);
      await up(adapter);
      expect((await query.describeTable(table)).multiIslandScore).toBeUndefined();
      expect(await query.select(null, table)).toEqual(before.map(row => { const retained = { ...row }; delete retained.multiIslandScore; return retained; }));
      expect(await query.showIndex(table)).toEqual(indexes);
      expect(await query.select(null, child)).toEqual([{ id: 1, articleId: 1 }]);
      await expect(down()).rejects.toThrow('backup');
    } finally {
      await query.dropTable(child);
      await query.dropTable(table);
      if (local) await sequelize.close();
    }
  });
});
