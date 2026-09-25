import { describe, expect, it } from 'vitest';
import { Sequelize, DataTypes } from 'sequelize';
import { up, down } from '../../migrations/20260925002000-add-feed-source-affinity.mjs';

describe('feed source affinity migration', () => {
  it('adds a nullable score to existing feeds', async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    const query = sequelize.getQueryInterface();
    try {
      await query.createTable('feeds', { id: { type: DataTypes.INTEGER, primaryKey: true } });
      await query.bulkInsert('feeds', [{ id: 1 }]);
      await up(query, Sequelize);
      await up(query, Sequelize);
      expect((await query.describeTable('feeds')).sourceAffinity.allowNull).toBe(true);
      expect(await query.rawSelect('feeds', { where: { id: 1 } }, 'sourceAffinity')).toBeNull();
      await down(query);
      expect((await query.describeTable('feeds')).sourceAffinity).toBeUndefined();
    } finally { await sequelize.close(); }
  });
});
