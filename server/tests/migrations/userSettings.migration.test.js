import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/20260918001000-rename-user-settings.mjs';

describe('user settings migration', () => {
  it('preserves saved preferences and uniqueness through rename and rollback', async () => {
    const { Setting, User, sequelize } = db;
    const query = sequelize.getQueryInterface();
    expect(Setting.getTableName()).toBe('user_settings');
    const user = await User.create({ username: 'settings-migration-reader' });
    const setting = await Setting.create({ userId: user.id, themeMode: 'dark', markAsReadOnScroll: false });
    const original = (await setting.reload()).get({ plain: true });

    try {
      await down(query);
      expect(await query.showAllTables()).not.toContain('user_settings');
      expect(await query.select(null, 'settings', { where: { id: setting.id } })).toEqual([
        expect.objectContaining({ id: setting.id, userId: original.userId, themeMode: 'dark' })
      ]);

      await up(query);
      expect(await query.showAllTables()).not.toContain('settings');
      expect((await Setting.findByPk(setting.id)).get({ plain: true })).toEqual(original);
      await expect(Setting.create({ userId: original.userId })).rejects.toThrow();
      await setting.update({ themeMode: 'light' });
      expect((await Setting.findByPk(setting.id)).themeMode).toBe('light');
    } finally {
      if ((await query.showAllTables()).includes('settings')) await up(query);
      await Setting.destroy({ where: { id: setting.id } });
      await User.destroy({ where: { id: user.id } });
    }
  });
});
