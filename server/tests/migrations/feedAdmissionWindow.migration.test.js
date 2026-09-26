import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260926000000-add-feed-admission-window.mjs';

it('marks established feeds at migration time and leaves incomplete imports retryable', async () => {
  const query = db.sequelize.getQueryInterface();
  const table = 'admission_migration_test';
  const adapter = {
    addColumn: (_table, column, options) => query.addColumn(table, column, options),
    removeColumn: (_table, column) => query.removeColumn(table, column),
    queryGenerator: { quoteTable: () => query.queryGenerator.quoteTable(table) },
    sequelize: db.sequelize
  };
  await query.createTable(table, { id: { type: DataTypes.INTEGER, primaryKey: true },
    lastSuccessfulCrawlAt: DataTypes.DATE, totalCrawlSuccesses: DataTypes.INTEGER,
    lastSuccessAt: DataTypes.DATE, lastArticleReceivedAt: DataTypes.DATE });
  try {
    const old = new Date('2020-01-01T00:00:00Z');
    await query.bulkInsert(table, [
      { id: 1, lastSuccessfulCrawlAt: old, totalCrawlSuccesses: 1, lastSuccessAt: old, lastArticleReceivedAt: old },
      { id: 2, lastSuccessfulCrawlAt: null, totalCrawlSuccesses: 0, lastSuccessAt: old, lastArticleReceivedAt: old },
      { id: 3, lastSuccessfulCrawlAt: null, totalCrawlSuccesses: 0, lastSuccessAt: null, lastArticleReceivedAt: null },
      { id: 4, lastSuccessfulCrawlAt: null, totalCrawlSuccesses: 1, lastSuccessAt: old, lastArticleReceivedAt: null }
    ]);
    const before = Math.floor(Date.now() / 1000) * 1000;
    await up(adapter, DataTypes);
    const rows = await query.select(null, table, { order: [['id', 'ASC']] });
    expect(rows.map(row => row.ongoingAdmissionWindowDays)).toEqual([30, 30, 30, 30]);
    for (const index of [0, 3]) {
      const timestamp = rows[index].initialImportCompletedAt;
      // Raw SQLite CURRENT_TIMESTAMP values omit the UTC suffix; model reads apply it.
      const completedAt = new Date(typeof timestamp === 'string' ? `${timestamp}Z` : timestamp);
      expect(completedAt.getTime()).toBeGreaterThanOrEqual(before);
    }
    expect(rows[1].initialImportCompletedAt).toBeNull();
    expect(rows[2].initialImportCompletedAt).toBeNull();
    await query.bulkInsert(table, [{ id: 5 }]);
    const added = (await query.select(null, table, { where: { id: 5 } }))[0];
    expect(added).toMatchObject({ initialImportCompletedAt: null, ongoingAdmissionWindowDays: 30 });
    await down(adapter);
    expect(await query.describeTable(table)).not.toHaveProperty('initialImportCompletedAt');
    expect(await query.describeTable(table)).not.toHaveProperty('ongoingAdmissionWindowDays');
    expect(await query.select(null, table)).toHaveLength(5);
  } finally { await query.dropTable(table); }
});
