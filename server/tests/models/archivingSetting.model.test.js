import { describe, expect, it } from 'vitest';
import { DataTypes } from 'sequelize';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260919000000-add-archiving-settings.mjs';

const { ArchivingSetting, User } = db;

describe('ArchivingSetting', () => {
  it('persists defaults, enforces one record per user, and cascades user deletion', async () => {
    const user = await User.create({ username: `archive-${Date.now()}`, password: 'test-password' });
    const settings = await ArchivingSetting.create({ userId: user.id });

    expect(await settings.reload()).toMatchObject({
      neverDeleteUnreadArticles: true,
      neverDeleteFavorites: true,
      neverDeleteClickedArticles: false,
      maximumArticleAge: 7,
      maximumArticleAgeUnit: 'days',
      maximumArticlesPerFeed: null,
      maximumArticlesTotal: null
    });
    expect(await user.getArchivingSetting()).toMatchObject({ id: settings.id });
    expect(await settings.getUser()).toMatchObject({ id: user.id });
    await expect(ArchivingSetting.create({ userId: user.id })).rejects.toMatchObject({
      name: 'SequelizeUniqueConstraintError'
    });
    await user.destroy();
    expect(await ArchivingSetting.findByPk(settings.id)).toBeNull();
  });

  it.each(['days', 'weeks', 'months', 'years'])('accepts %s and the requested count ceilings', async unit => {
    await expect(ArchivingSetting.build({
      userId: 1,
      maximumArticleAgeUnit: unit,
      maximumArticlesPerFeed: 1000000,
      maximumArticlesTotal: 1000000000
    }).validate()).resolves.toBeTruthy();
  });

  it.each([
    ['maximumArticleAge', 0],
    ['maximumArticleAge', 1.5],
    ['maximumArticleAgeUnit', 'hours'],
    ['maximumArticlesPerFeed', 1000001],
    ['maximumArticlesPerFeed', -1],
    ['maximumArticlesPerFeed', 1.5],
    ['maximumArticlesTotal', 1000000001],
    ['maximumArticlesTotal', 0],
    ['maximumArticlesTotal', 1.5]
  ])('rejects invalid %s: %s', async (field, value) => {
    await expect(ArchivingSetting.build({ userId: 1, [field]: value }).validate()).rejects.toThrow();
  });

  it('migrates defaults and ownership constraints and rolls back', async () => {
    const query = db.sequelize.getQueryInterface();
    const table = 'archiving_settings_migration_test';
    const adapter = {
      createTable: (_name, columns, options) => query.createTable(table, columns, options),
      // SQLite index names are database-wide, so isolate them along with the table.
      addIndex: (name, fields, options) => query.addIndex(table, fields, { ...options, name: options.name.replace(name, table) }),
      dropTable: () => query.dropTable(table)
    };
    const user = await User.create({ username: `archive-migration-${Date.now()}`, password: 'test-password' });
    const row = { userId: user.id, createdAt: new Date(), updatedAt: new Date() };
    try {
      await up(adapter, DataTypes);
      await query.bulkInsert(table, [row]);
      const [settings] = await query.select(null, table);
      expect(Boolean(settings.neverDeleteUnreadArticles)).toBe(true);
      expect(Boolean(settings.neverDeleteFavorites)).toBe(true);
      expect(Boolean(settings.neverDeleteClickedArticles)).toBe(false);
      expect(settings).toMatchObject({
        maximumArticleAge: 7,
        maximumArticleAgeUnit: 'days',
        maximumArticlesPerFeed: null,
        maximumArticlesTotal: null
      });
      await expect(query.bulkInsert(table, [row])).rejects.toThrow();
      await user.destroy();
      expect(await query.select(null, table)).toHaveLength(0);
      await expect(query.bulkInsert(table, [row])).rejects.toThrow();
    } finally {
      await down(adapter);
      await user.destroy();
    }
    expect(await query.showAllTables()).not.toContain(table);
  });
});
