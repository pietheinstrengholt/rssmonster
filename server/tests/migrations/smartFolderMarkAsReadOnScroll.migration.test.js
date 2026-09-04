import { createRequire } from 'node:module';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260904001000-add-smart-folder-mark-as-read-on-scroll.js'
);

describe('Smart Folder mark-as-read-on-scroll migration', () => {
  it('backfills unread folders from user settings and disables the option elsewhere', async () => {
    const database = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const queryInterface = database.getQueryInterface();

    try {
      await queryInterface.createTable('settings', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        markAsReadOnScroll: { type: DataTypes.BOOLEAN, allowNull: false }
      });
      await queryInterface.createTable('smart_folders', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        query: { type: DataTypes.STRING, allowNull: false }
      });
      await queryInterface.bulkInsert('settings', [
        { userId: 1, markAsReadOnScroll: true },
        { userId: 2, markAsReadOnScroll: false }
      ]);
      await queryInterface.bulkInsert('smart_folders', [
        { id: 10, userId: 1, name: 'Enabled', query: 'unread:true tag:news' },
        { id: 11, userId: 1, name: 'Not unread', query: 'favorite:true' },
        { id: 12, userId: 1, name: 'Unread overridden', query: 'unread:true unread:false' },
        { id: 20, userId: 2, name: 'Disabled', query: 'unread:true' },
        { id: 30, userId: 3, name: 'Legacy default', query: 'unread:true' },
        { id: 31, userId: 3, name: 'Default not unread', query: 'hot:true' }
      ]);

      await migration.up(queryInterface, DataTypes);

      const folders = await database.query(
        'SELECT id, markAsReadOnScroll FROM smart_folders ORDER BY id',
        { type: QueryTypes.SELECT }
      );
      expect(folders.map(folder => ({
        id: folder.id,
        markAsReadOnScroll: Boolean(folder.markAsReadOnScroll)
      }))).toEqual([
        { id: 10, markAsReadOnScroll: true },
        { id: 11, markAsReadOnScroll: false },
        { id: 12, markAsReadOnScroll: false },
        { id: 20, markAsReadOnScroll: false },
        { id: 30, markAsReadOnScroll: true },
        { id: 31, markAsReadOnScroll: false }
      ]);

      const columns = await queryInterface.describeTable('smart_folders');
      expect(columns.markAsReadOnScroll).toMatchObject({
        allowNull: false,
        defaultValue: false
      });

      await queryInterface.bulkInsert('smart_folders', [
        { id: 40, userId: 4, name: 'New folder', query: 'unread:true' }
      ]);
      const [newFolder] = await database.query(
        'SELECT markAsReadOnScroll FROM smart_folders WHERE id = 40',
        { type: QueryTypes.SELECT }
      );
      expect(Boolean(newFolder.markAsReadOnScroll)).toBe(false);

      await migration.down(queryInterface);
      expect((await queryInterface.describeTable('smart_folders')).markAsReadOnScroll)
        .toBeUndefined();
    } finally {
      await database.close();
    }
  });
});
