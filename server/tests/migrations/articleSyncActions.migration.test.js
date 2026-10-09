import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20261009000000-add-article-sync-actions.mjs';
describe('article synchronization receipt migration', () => {
  it('enforces account UUID uniqueness, retains deleted article receipts and cascades user deletion', async () => {
    const database = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = database.getQueryInterface();
    try {
      await query.createTable('users', { id: { type: DataTypes.INTEGER, primaryKey: true } });
      await query.bulkInsert('users', [{ id: 1 }, { id: 2 }]);
      await up(query, Sequelize);
      const row = { userId: 1, actionId: '8792c568-3795-4987-a8fc-53591c57100d', articleId: Number.MAX_SAFE_INTEGER,
        kind: 'set-status', value: 'read', outcome: 'rejected', errorCode: 'ARTICLE_UNAVAILABLE', createdAt: new Date(), updatedAt: new Date() };
      await query.bulkInsert('article_sync_actions', [row]);
      await expect(query.bulkInsert('article_sync_actions', [row])).rejects.toThrow();
      await query.bulkInsert('article_sync_actions', [{ ...row, userId: 2 }]);
      await query.bulkDelete('users', { id: 1 });
      const [receipts] = await database.query('SELECT * FROM article_sync_actions');
      expect(receipts).toHaveLength(1); expect(receipts[0].userId).toBe(2);
      expect(receipts[0].articleId).toBe(Number.MAX_SAFE_INTEGER);
      await expect(down(query, Sequelize)).rejects.toThrow('receipts');
    } finally { await database.close(); }
  });
});
