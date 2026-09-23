import { describe, expect, it } from 'vitest';
import { DataTypes } from 'sequelize';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260923000000-add-sidebar-settings.mjs';

const { SidebarSetting, User } = db;

describe('SidebarSetting', () => {
  it('persists defaults, enforces one record per user, and cascades user deletion', async () => {
    const user = await User.create({ username: `sidebar-${Date.now()}`, password: 'test-password' });
    const settings = await SidebarSetting.create({ userId: user.id });

    expect(await settings.reload()).toMatchObject({
      showTotalCount: true,
      declutterCounts: true
    });
    expect(await user.getSidebarSetting()).toMatchObject({ id: settings.id });
    expect(await settings.getUser()).toMatchObject({ id: user.id });
    await expect(SidebarSetting.create({ userId: user.id })).rejects.toMatchObject({
      name: 'SequelizeUniqueConstraintError'
    });
    await user.destroy();
    expect(await SidebarSetting.findByPk(settings.id)).toBeNull();
  });

  it('migrates defaults and ownership constraints and rolls back', async () => {
    const query = db.sequelize.getQueryInterface();
    const table = 'sidebar_settings_migration_test';
    const adapter = {
      createTable: (_name, columns, options) => query.createTable(table, columns, options),
      // SQLite index names are database-wide, so isolate them along with the table.
      addIndex: (name, fields, options) => query.addIndex(table, fields, { ...options, name: options.name.replace(name, table) }),
      dropTable: () => query.dropTable(table)
    };
    const user = await User.create({ username: `sidebar-migration-${Date.now()}`, password: 'test-password' });
    const row = { userId: user.id, createdAt: new Date(), updatedAt: new Date() };
    try {
      await up(adapter, DataTypes);
      await query.bulkInsert(table, [row]);
      const [settings] = await query.select(null, table);
      expect(Boolean(settings.showTotalCount)).toBe(true);
      expect(Boolean(settings.declutterCounts)).toBe(true);
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
