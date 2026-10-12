import { DataTypes, Sequelize } from 'sequelize';
import { expect, it } from 'vitest';
import db from '../../models/index.js';
import { up, down } from '../../migrations/pre-2.4/20261012001000-standardize-reading-modes.mjs';

it('preserves SQLite preferences, schema objects, references and sequence through migration, retry and rollback', async () => {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const qi = sequelize.getQueryInterface();
  try {
    await qi.createTable('user_settings', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      viewMode: { type: DataTypes.STRING, allowNull: false, defaultValue: 'full' },
      themeMode: { type: DataTypes.STRING, defaultValue: 'dark' },
      updatedAt: DataTypes.DATE
    });
    await qi.addIndex('user_settings', ['viewMode'], { name: 'reading_mode_index' });
    await qi.createTable('reading_mode_references', { settingId: {
      type: DataTypes.INTEGER, references: { model: 'user_settings', key: 'id' }
    } });
    await sequelize.query('CREATE TRIGGER preserve_setting_theme BEFORE UPDATE ON user_settings WHEN NEW.themeMode IS NULL BEGIN SELECT RAISE(ABORT, \'theme required\'); END');
    const timestamp = new Date('2026-10-01T12:00:00Z');
    await qi.bulkInsert('user_settings', ['full', 'minimal', 'reader', 'summarized', 'summaryBullets', 'expanded', 'headlines', 'unknown'].map((viewMode, index) => ({ id: index + 1, userId: index + 1, viewMode, updatedAt: timestamp })));
    await qi.bulkInsert('reading_mode_references', [{ settingId: 1 }]);
    await qi.bulkInsert('user_settings', [{ id: 100, userId: 100 }]);
    await sequelize.query('DELETE FROM user_settings WHERE id = 100');
    await up(qi);
    await up(qi);
    const rows = await qi.select(null, 'user_settings', { order: [['id', 'ASC']] });
    expect(rows.map(row => row.viewMode)).toEqual(['expanded', 'headlines', 'reader', 'summarized', 'summaryBullets', 'expanded', 'headlines', 'unknown']);
    expect(rows.every(row => row.themeMode === 'dark' && new Date(row.updatedAt).getTime() === timestamp.getTime())).toBe(true);
    expect((await qi.showIndex('user_settings')).some(index => index.name === 'reading_mode_index')).toBe(true);
    await expect(qi.bulkUpdate('user_settings', { themeMode: null }, { id: 1 })).rejects.toMatchObject({ original: { message: expect.stringContaining('theme required') } });
    await expect(qi.bulkInsert('user_settings', [{ userId: 1 }])).rejects.toThrow();
    await qi.bulkInsert('user_settings', [{ userId: 101 }]);
    expect((await qi.select(null, 'user_settings', { where: { userId: 101 } }))[0]).toMatchObject({ id: 101, viewMode: 'expanded' });
    expect((await sequelize.query('PRAGMA foreign_key_check'))[0]).toEqual([]);
    await expect(sequelize.query('DELETE FROM user_settings WHERE id = 1')).rejects.toThrow();
    await down(qi);
    await down(qi);
    await qi.bulkInsert('user_settings', [{ userId: 102 }]);
    expect((await qi.select(null, 'user_settings', { where: { userId: 102 } }))[0]).toMatchObject({ id: 102, viewMode: 'full' });
    expect((await qi.select(null, 'user_settings', { where: { id: 2 } }))[0].viewMode).toBe('minimal');
  } finally { await sequelize.close(); }
});

it('migrates configured database preferences and their physical default', async () => {
  const qi = db.sequelize.getQueryInterface();
  const users = await Promise.all([1, 2, 3].map(index => db.User.create({
    username: `reading-mode-migration-${index}`, password: 'hashed-password', feverCredentialHash: `reading-mode-${index}`, role: 'user'
  })));
  await db.Setting.create({ userId: users[0].id, themeMode: 'dark' });
  await db.Setting.create({ userId: users[1].id, viewMode: 'reader' });
  await qi.bulkUpdate('user_settings', { viewMode: 'minimal' }, { userId: users[0].id });
  try {
    await up(qi);
    await up(qi);
    expect((await db.Setting.findOne({ where: { userId: users[0].id } })).toJSON()).toMatchObject({ viewMode: 'headlines', themeMode: 'dark' });
    expect((await db.Setting.findOne({ where: { userId: users[1].id } })).viewMode).toBe('reader');
    await qi.bulkInsert('user_settings', [{ userId: users[2].id, createdAt: new Date(), updatedAt: new Date() }]);
    expect((await db.Setting.findOne({ where: { userId: users[2].id } })).viewMode).toBe('expanded');
    await down(qi);
    expect((await db.Setting.findOne({ where: { userId: users[0].id } })).viewMode).toBe('minimal');
    expect((await qi.describeTable('user_settings')).viewMode.defaultValue).toBe('full');
  } finally { await up(qi); }
});
