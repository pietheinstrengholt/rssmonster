import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260919001000-add-island-support-article-ids.mjs';

describe('Island support IDs migration', () => {
  it('leaves legacy support unknown and preserves Island data across repeat application and rollback', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('islands', { id: { type: DataTypes.INTEGER, primaryKey: true }, weight: DataTypes.FLOAT });
      await query.bulkInsert('islands', [{ id: 1, weight: 0.5 }]);
      await up(query, Sequelize); await up(query, Sequelize);
      expect(await query.rawSelect('islands', { where: { id: 1 } }, 'supportArticleIds')).toBeNull();
      await down(query);
      expect((await query.describeTable('islands')).supportArticleIds).toBeUndefined();
      expect(await query.rawSelect('islands', { where: { id: 1 } }, 'weight')).toBe(0.5);
    } finally { await sequelize.close(); }
  });
});
