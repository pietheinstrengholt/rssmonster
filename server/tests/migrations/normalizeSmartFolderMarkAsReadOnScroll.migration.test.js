import { createRequire } from 'node:module';
import { DataTypes, QueryTypes, Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require(
  '../../migrations/20260904002000-normalize-smart-folder-mark-as-read-on-scroll.js'
);

describe('Smart Folder mark-as-read-on-scroll normalization migration', () => {
  it('disables persisted values unless the effective query filter is unread:true', async () => {
    const database = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const queryInterface = database.getQueryInterface();

    try {
      await queryInterface.createTable('smart_folders', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        query: { type: DataTypes.STRING, allowNull: false },
        markAsReadOnScroll: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        }
      });
      await queryInterface.bulkInsert('smart_folders', [
        { id: 1, query: 'unread:true tag:news', markAsReadOnScroll: true },
        { id: 2, query: 'favorite:true', markAsReadOnScroll: true },
        { id: 3, query: 'unread:true unread:false', markAsReadOnScroll: true },
        { id: 4, query: 'unread:true', markAsReadOnScroll: false }
      ]);

      await migration.up(queryInterface);

      const folders = await database.query(
        'SELECT id, markAsReadOnScroll FROM smart_folders ORDER BY id',
        { type: QueryTypes.SELECT }
      );
      expect(folders.map(folder => ({
        id: folder.id,
        markAsReadOnScroll: Boolean(folder.markAsReadOnScroll)
      }))).toEqual([
        { id: 1, markAsReadOnScroll: true },
        { id: 2, markAsReadOnScroll: false },
        { id: 3, markAsReadOnScroll: false },
        { id: 4, markAsReadOnScroll: false }
      ]);

      await migration.down(queryInterface);
      const unchanged = await database.query(
        'SELECT id, markAsReadOnScroll FROM smart_folders ORDER BY id',
        { type: QueryTypes.SELECT }
      );
      expect(Boolean(unchanged[0].markAsReadOnScroll)).toBe(true);
      expect(Boolean(unchanged[1].markAsReadOnScroll)).toBe(false);
    } finally {
      await database.close();
    }
  });
});
