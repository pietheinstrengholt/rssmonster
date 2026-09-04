import { createRequire } from 'node:module';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260904001000-add-smart-folder-mark-as-read-on-scroll.js'
);

describe('Smart Folder mark-as-read-on-scroll migration', () => {
  it('backfills existing folders from user settings and uses the legacy default', async () => {
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
        name: { type: DataTypes.STRING, allowNull: false }
      });
      await queryInterface.bulkInsert('settings', [
        { userId: 1, markAsReadOnScroll: true },
        { userId: 2, markAsReadOnScroll: false }
      ]);
      await queryInterface.bulkInsert('smart_folders', [
        { id: 10, userId: 1, name: 'Enabled' },
        { id: 20, userId: 2, name: 'Disabled' },
        { id: 30, userId: 3, name: 'No settings row' }
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
        { id: 20, markAsReadOnScroll: false },
        { id: 30, markAsReadOnScroll: true }
      ]);

      const columns = await queryInterface.describeTable('smart_folders');
      expect(columns.markAsReadOnScroll).toMatchObject({
        allowNull: false,
        defaultValue: false
      });

      await queryInterface.bulkInsert('smart_folders', [
        { id: 40, userId: 4, name: 'New folder' }
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
