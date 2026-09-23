import { DataTypes } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923002000-add-inactive-feed-settings.mjs';

it('backfills owned receipt dates and preserves existing settings through rollback', async () => {
  const query = db.sequelize.getQueryInterface();
  const tables = { feeds: 'inactive_feeds_migration_test', articles: 'inactive_articles_migration_test', sidebar_settings: 'inactive_settings_migration_test' };
  const adapter = {
    addColumn: (table, column, options) => query.addColumn(tables[table], column, options),
    removeColumn: (table, column) => query.removeColumn(tables[table], column),
    queryGenerator: { quoteTable: table => query.queryGenerator.quoteTable(tables[table]) },
    sequelize: db.sequelize
  };
  await query.createTable(tables.feeds, { id: { type: DataTypes.INTEGER, primaryKey: true }, userId: DataTypes.INTEGER });
  await query.createTable(tables.articles, { id: { type: DataTypes.INTEGER, primaryKey: true }, feedId: DataTypes.INTEGER, userId: DataTypes.INTEGER, createdAt: DataTypes.DATE, publishedAt: DataTypes.DATE });
  await query.createTable(tables.sidebar_settings, { id: { type: DataTypes.INTEGER, primaryKey: true }, hideZeroCountItems: DataTypes.BOOLEAN });
  try {
    await query.bulkInsert(tables.feeds, [{ id: 1, userId: 1 }, { id: 2, userId: 1 }]);
    const older = new Date('2026-01-01T00:00:00Z');
    const latest = new Date('2026-02-01T00:00:00Z');
    await query.bulkInsert(tables.articles, [
      { id: 1, userId: 1, feedId: 1, createdAt: older, publishedAt: latest },
      { id: 2, userId: 1, feedId: 1, createdAt: latest, publishedAt: older },
      { id: 3, userId: 2, feedId: 1, createdAt: new Date('2026-03-01T00:00:00Z'), publishedAt: older }
    ]);
    await query.bulkInsert(tables.sidebar_settings, [{ id: 1, hideZeroCountItems: true }]);
    await up(adapter, DataTypes);
    await query.bulkInsert(tables.sidebar_settings, [{ id: 2, hideZeroCountItems: false }]);
    const feeds = await query.select(null, tables.feeds, { order: [['id', 'ASC']] });
    expect(new Date(feeds[0].lastArticleReceivedAt).getTime()).toBe(latest.getTime());
    expect(feeds[1].lastArticleReceivedAt).toBeNull();
    const settings = await query.select(null, tables.sidebar_settings);
    expect(settings.map(row => [Boolean(row.automaticallyHideInactiveFeeds), row.inactiveFeedDays])).toEqual([[false, 30], [false, 30]]);
    await down(adapter);
    expect(await query.describeTable(tables.feeds)).not.toHaveProperty('lastArticleReceivedAt');
    expect(await query.describeTable(tables.sidebar_settings)).not.toHaveProperty('inactiveFeedDays');
    expect((await query.select(null, tables.sidebar_settings)).map(row => Boolean(row.hideZeroCountItems))).toEqual([true, false]);
  } finally {
    for (const table of Object.values(tables)) await query.dropTable(table);
  }
});
